import { spawn, type ChildProcess } from "node:child_process";
import type { ExifToolResult, ExifToolCloseResult } from "./types";
import {
	extractReadySegments,
	parseExiftoolOutput,
} from "./exiftool_stdout_parser";

const EXIFTOOL_CLOSE_TIMEOUT_MS = 5000;
export const EXIFTOOL_COMMAND_TIMEOUT_MS = 30000;

// Node's setTimeout maximum delay (2^31-1 ms, a 32-bit signed int of milliseconds). A delay
// beyond this fires after 1 ms instead of waiting (Node clamps/overflows it), which would
// silently truncate an uncapped write deadline (D-57). Deadlines longer than this are chained
// across segments of at most this size instead.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

// Assumed floor throughput for scaling a write command's deadline by source size (D-57). This
// is an assumption, not a measurement -- the only measured throughput is 2078.5 MB/s on a
// local APFS SSD (EVIDENCE A-4 item 8). The assumption itself is recorded in EVIDENCE A-5.
export const ASSUMED_WRITE_FLOOR_BYTES_PER_SECOND = 20_000_000;

export function writeDeadlineMs({
	sourceBytes,
}: {
	sourceBytes: number;
}): number {
	return (
		EXIFTOOL_COMMAND_TIMEOUT_MS +
		Math.ceil((sourceBytes * 1000) / ASSUMED_WRITE_FLOOR_BYTES_PER_SECOND)
	);
}

/**
 * ExifTool's stay-open protocol is line-delimited. A path containing a line
 * break would become additional protocol arguments instead of one filename.
 */
export class UnsafeExifToolPathError extends Error {
	readonly code = "unsafe-exiftool-path" as const;

	constructor() {
		super("The selected path contains an unsupported line break");
		this.name = "UnsafeExifToolPathError";
	}
}

export function assertSafeExifToolPath(filePath: string): void {
	if (/[\r\n]/u.test(filePath)) {
		throw new UnsafeExifToolPathError();
	}
}

/**
 * Rejects only the command whose deadline fired. By the time this is constructed, the whole
 * ExifTool process tree has already been killed and its exit confirmed (D-59), so the caller
 * may treat any output the writer produced as unreported/orphaned rather than in-flight.
 */
export class ExifToolCommandTimeoutError extends Error {
	readonly code = "exiftool-command-timeout" as const;
	readonly executeNum: number;
	readonly deadlineMs: number;

	constructor({
		executeNum,
		deadlineMs,
	}: {
		executeNum: number;
		deadlineMs: number;
	}) {
		super(
			`ExifTool command ${executeNum} exceeded its ${deadlineMs} ms deadline. The ExifTool process tree was stopped and its exit confirmed.`,
		);
		this.name = "ExifToolCommandTimeoutError";
		this.executeNum = executeNum;
		this.deadlineMs = deadlineMs;
	}
}

type QueueEntry = {
	executeNum: number;
	command: string;
	deadlineMs: number;
	resolve: (result: ExifToolResult) => void;
	reject: (error: Error) => void;
};

type InFlightEntry = QueueEntry & {
	timer: NodeJS.Timeout;
	settled: boolean;
};

type ProcessState =
	| "closed"
	| "ready"
	| "killing"
	| "unavailable"
	| "closing";

export class ExiftoolProcess {
	private readonly binPath: string;
	private process: ChildProcess | null = null;
	private executeCounter = 0;
	private stdoutBuffer = "";
	private stderrBuffer = "";

	private state: ProcessState = "closed";
	private queue: QueueEntry[] = [];
	private inFlight: InFlightEntry | null = null;
	private closeRequested = false;
	// Memoized per session so a second caller (the timeout path and close()) awaits the same
	// kill instead of issuing a second SIGKILL/taskkill (D-61).
	private killPromise: Promise<void> | null = null;
	// Reset to 0 by startSession() for every new session. A replacement session that dies
	// before resolving even one command is a failed respawn under D-61, not a healthy session
	// having a bad day -- handleExit() reads this to decide whether to respawn again or give up.
	private resolvedCommandCount = 0;

	constructor({ binPath }: { binPath: string }) {
		this.binPath = binPath;
	}

	/** The current live session's pid, or undefined when closed, unavailable or between sessions. */
	get pid(): number | undefined {
		return this.process?.pid;
	}

	async open(): Promise<number> {
		if (this.process) {
			throw new Error("ExifTool process is already open");
		}

		const pid = this.startSession();
		if (pid === undefined) {
			this.process = null;
			throw new Error("Failed to spawn ExifTool process");
		}

		this.state = "ready";
		return pid;
	}

	async close(): Promise<ExifToolCloseResult> {
		if (this.state === "closed") {
			return { success: true, error: null };
		}

		if (this.state === "unavailable") {
			this.state = "closed";
			this.process = null;
			return { success: true, error: null };
		}

		this.closeRequested = true;
		this.rejectQueue(new Error("ExifTool process closed"));

		if (this.state === "killing") {
			// The in-flight command belongs to the deadline path; it rejects with
			// ExifToolCommandTimeoutError exactly once and skips respawn because
			// closeRequested is now true. Sharing this promise (rather than issuing a
			// second kill) is what makes close()-during-kill safe (D-61).
			if (this.killPromise !== null) {
				await this.killPromise;
			}
			this.state = "closed";
			this.process = null;
			return { success: true, error: null };
		}

		const proc = this.process;
		if (proc === null) {
			this.state = "closed";
			return { success: true, error: null };
		}

		this.state = "closing";

		try {
			proc.stdin?.write("-stay_open\nFalse\n");
			proc.stdin?.end();
		} catch (err) {
			console.error("Error sending close command to ExifTool:", err);
		}

		const result = await new Promise<ExifToolCloseResult>((resolve) => {
			const timeout = setTimeout(() => {
				console.warn("ExifTool did not exit gracefully, killing process");
				void this.killTree(proc).then(() => {
					resolve({
						success: false,
						error: new Error("ExifTool process did not exit in time"),
					});
				});
			}, EXIFTOOL_CLOSE_TIMEOUT_MS);

			proc.once("exit", () => {
				clearTimeout(timeout);
				resolve({ success: true, error: null });
			});
		});

		this.rejectInFlight(new Error("ExifTool process closed"));
		this.state = "closed";
		this.process = null;
		return result;
	}

	async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<ExifToolResult> {
		assertSafeExifToolPath(filePath);
		this.assertDispatchable();

		const executeNum = this.executeCounter++;
		const command = ["-json", ...args, filePath, `-execute${executeNum}`].join(
			"\n",
		);

		return this.enqueue({
			executeNum,
			command,
			deadlineMs: EXIFTOOL_COMMAND_TIMEOUT_MS,
		});
	}

	async writeMetadata({
		filePath,
		metadata,
		extraArgs,
		deadlineMs,
	}: {
		filePath: string;
		metadata: Record<string, unknown>;
		extraArgs: string[];
		deadlineMs?: number;
	}): Promise<ExifToolResult> {
		assertSafeExifToolPath(filePath);
		this.assertDispatchable();

		const executeNum = this.executeCounter++;

		const metadataArgs: string[] = [];
		for (const [key, value] of Object.entries(metadata)) {
			if (value === "") {
				metadataArgs.push(`-${key}=`);
			} else {
				metadataArgs.push(`-${key}=${value}`);
			}
		}

		const command = [
			...extraArgs,
			...metadataArgs,
			filePath,
			`-execute${executeNum}`,
		].join("\n");

		return this.enqueue({
			executeNum,
			command,
			deadlineMs: deadlineMs ?? EXIFTOOL_COMMAND_TIMEOUT_MS,
		});
	}

	private assertDispatchable(): void {
		if (
			this.state === "closed" ||
			this.state === "closing" ||
			this.state === "unavailable"
		) {
			throw new Error("ExifTool process is not open");
		}
	}

	private enqueue({
		executeNum,
		command,
		deadlineMs,
	}: {
		executeNum: number;
		command: string;
		deadlineMs: number;
	}): Promise<ExifToolResult> {
		return new Promise((resolve, reject) => {
			this.queue.push({ executeNum, command, deadlineMs, resolve, reject });
			this.pump();
		});
	}

	/** Dispatches the queue head only when idle. A queued command never has a timer. */
	private pump(): void {
		if (this.state !== "ready" || this.inFlight !== null) {
			return;
		}

		const next = this.queue.shift();
		if (next === undefined) {
			return;
		}

		if (!this.process || !this.process.stdin) {
			next.reject(new Error("ExifTool process is not open"));
			return;
		}

		const stdin = this.process.stdin;
		stdin.write(next.command + "\n");

		// The deadline timer starts here, at dispatch, never at enqueue (D-58). A deadline
		// beyond MAX_TIMER_DELAY_MS is chained across segments rather than truncated (D-57).
		const entry: InFlightEntry = {
			...next,
			settled: false,
			timer: null as unknown as NodeJS.Timeout,
		};
		entry.timer = this.armDeadlineSegment(entry, next.deadlineMs);
		this.inFlight = entry;
	}

	/**
	 * Arms one timer segment capped at MAX_TIMER_DELAY_MS. When that segment fires with time
	 * still remaining, it re-arms on the same in-flight entry rather than firing the deadline,
	 * so the entry always holds exactly one live handle that the ready path clears (D-57's "no
	 * cap", chained instead of truncated). The D-59 guard only runs once the full deadline has
	 * elapsed.
	 */
	private armDeadlineSegment(
		entry: InFlightEntry,
		remainingMs: number,
	): NodeJS.Timeout {
		const segmentMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
		return setTimeout(() => {
			const leftoverMs = remainingMs - segmentMs;
			if (leftoverMs > 0) {
				entry.timer = this.armDeadlineSegment(entry, leftoverMs);
				return;
			}
			this.handleDeadline(entry);
		}, segmentMs);
	}

	/** D-59: kill-confirm-reject-respawn-dispatch, in order. */
	private handleDeadline(entry: InFlightEntry): void {
		// Step 1: a deadline that fires after its command already resolved does nothing.
		if (this.inFlight !== entry || entry.settled || this.state !== "ready") {
			return;
		}

		this.state = "killing";
		const proc = this.process;
		if (proc === null) {
			return;
		}

		void this.killTree(proc).then(() => {
			entry.settled = true;
			this.inFlight = null;
			entry.reject(
				new ExifToolCommandTimeoutError({
					executeNum: entry.executeNum,
					deadlineMs: entry.deadlineMs,
				}),
			);

			// close() may have been requested while the kill was in flight; it shares
			// this exact promise and handles its own state transition (D-61).
			if (this.closeRequested) {
				return;
			}

			this.respawn();
			this.pump();
		});
	}

	/**
	 * Kills the whole process tree and resolves once its exit is confirmed. Memoized per
	 * session so close() and the deadline path never issue a second kill (D-59, D-61).
	 */
	private killTree(proc: ChildProcess): Promise<void> {
		if (this.killPromise !== null) {
			return this.killPromise;
		}

		this.killPromise = new Promise<void>((resolve) => {
			if (proc.exitCode !== null || proc.signalCode !== null) {
				resolve();
				return;
			}

			proc.once("exit", () => {
				resolve();
			});

			if (process.platform === "win32") {
				if (proc.pid === undefined) {
					proc.kill();
					return;
				}
				// exiftool.exe on Windows is a launcher wrapping a separate perl.exe
				// child; a plain kill only terminates the launcher (D-59, RESEARCH
				// Pattern 3). Issued only while the ChildProcess reports no exit, to
				// guard against a recycled pid.
				const taskkill = spawn(
					"taskkill",
					["/pid", String(proc.pid), "/T", "/F"],
					{ windowsHide: true },
				);
				taskkill.once("error", () => {
					proc.kill();
				});
				taskkill.once("exit", (code) => {
					if (code !== 0) {
						proc.kill();
					}
				});
			} else {
				// The bundled POSIX binary is a single process reached directly by its
				// own pid (RESEARCH Pattern 1: shebang exec-chains in place, no fork) --
				// no process-group kill is needed.
				proc.kill("SIGKILL");
			}
		});

		return this.killPromise;
	}

	/** D-59 step 5 / D-61: fresh session on success, fast-fail-the-queue on failure. */
	private respawn(): void {
		this.process = null;
		let pid: number | undefined;
		try {
			pid = this.startSession();
		} catch {
			pid = undefined;
		}

		if (pid === undefined) {
			this.state = "unavailable";
			this.process = null;
			this.rejectQueue(
				new Error(
					"ExifTool process is not open. The replacement ExifTool session could not start.",
				),
			);
			return;
		}

		this.state = "ready";
	}

	/** Shared by open() and respawn(). Resets per-session buffers and attaches listeners. */
	private startSession(): number | undefined {
		this.stdoutBuffer = "";
		this.stderrBuffer = "";
		this.killPromise = null;
		this.resolvedCommandCount = 0;

		const proc = spawn(this.binPath, ["-stay_open", "True", "-@", "-"]);
		this.process = proc;

		proc.on("error", (err) => {
			console.error("ExifTool process error:", err);
		});

		// A write to a dead stdin pipe (e.g. a session torn down by a deadline kill)
		// must never become an uncaught EPIPE.
		proc.stdin?.on("error", (err) => {
			console.error("ExifTool stdin error:", err);
		});

		proc.on("exit", (code, signal) => {
			this.handleExit({ proc, code, signal });
		});

		proc.stdout?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			this.parseStdout({ proc, chunk });
		});

		proc.stderr?.setEncoding("utf8");
		proc.stderr?.on("data", (chunk: string) => {
			this.handleStderr({ proc, chunk });
		});

		return proc.pid;
	}

	/** D-61: an unexpected exit follows the same respawn path, never replaying the command. */
	private handleExit({
		proc,
		code,
		signal,
	}: {
		proc: ChildProcess;
		code: number | null;
		signal: NodeJS.Signals | null;
	}): void {
		if (proc !== this.process) {
			return;
		}
		// A kill-confirmed or graceful close's own exit is handled by killTree()/close()
		// directly; this handler only covers a genuinely unexpected exit.
		if (this.state === "killing" || this.state === "closing") {
			return;
		}

		console.error(
			`ExifTool exited unexpectedly with code ${code}, signal ${signal}`,
		);
		this.rejectInFlight(
			new Error(
				`ExifTool process exited unexpectedly (code: ${code}, signal: ${signal})`,
			),
		);

		// A replacement session that dies before resolving even one command is a failed
		// respawn under D-61: looping here would spin as fast as the OS can hand back a pid on
		// a permanently broken binary/perl install. Go straight to unavailable instead.
		if (this.resolvedCommandCount === 0) {
			this.state = "unavailable";
			this.process = null;
			this.rejectQueue(
				new Error(
					"ExifTool process is not open. The replacement ExifTool session exited before answering any command.",
				),
			);
			return;
		}

		this.respawn();
		this.pump();
	}

	private parseStdout({
		proc,
		chunk,
	}: {
		proc: ChildProcess;
		chunk: string;
	}): void {
		// Late stdout from a killed/replaced session must never resolve a command on the
		// new session (D-60).
		if (proc !== this.process) {
			return;
		}

		this.stdoutBuffer += chunk;
		const { completed, remaining } = extractReadySegments({
			buffer: this.stdoutBuffer,
		});
		this.stdoutBuffer = remaining;

		for (const segment of completed) {
			this.resolveIfMatching({
				executeNum: segment.executeNum,
				output: segment.output,
			});
		}
	}

	private resolveIfMatching({
		executeNum,
		output,
	}: {
		executeNum: number;
		output: string;
	}): void {
		const entry = this.inFlight;
		if (
			entry === null ||
			entry.executeNum !== executeNum ||
			entry.settled ||
			this.state !== "ready"
		) {
			return;
		}

		clearTimeout(entry.timer);
		entry.settled = true;
		this.inFlight = null;
		this.resolvedCommandCount += 1;
		entry.resolve(parseExiftoolOutput({ raw: output }));
		this.pump();
	}

	private handleStderr({
		proc,
		chunk,
	}: {
		proc: ChildProcess;
		chunk: string;
	}): void {
		if (proc !== this.process) {
			return;
		}

		this.stderrBuffer += chunk;
		if (this.stderrBuffer.includes("\n")) {
			const lines = this.stderrBuffer.split("\n");
			this.stderrBuffer = lines.pop() || "";
			lines.forEach((line) => {
				if (line.trim()) {
					console.warn("ExifTool stderr:", line);
				}
			});
		}
	}

	private rejectQueue(error: Error): void {
		const pending = this.queue.splice(0);
		for (const entry of pending) {
			entry.reject(error);
		}
	}

	private rejectInFlight(error: Error): void {
		const entry = this.inFlight;
		if (entry === null || entry.settled) {
			return;
		}
		clearTimeout(entry.timer);
		entry.settled = true;
		this.inFlight = null;
		entry.reject(error);
	}
}
