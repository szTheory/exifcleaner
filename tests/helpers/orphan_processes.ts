import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

export interface ProcessRow {
	pid: number;
	ppid: number;
	stat: string;
	args: string;
}

/** Parses `ps -o pid=,ppid=,stat=,args=` output: three fields, then the rest of the line as args. */
export function parsePsRows(raw: string): ProcessRow[] {
	const rows: ProcessRow[] = [];
	for (const line of raw.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line);
		if (match === null) {
			continue;
		}
		const [, pid, ppid, stat, args] = match;
		if (pid === undefined || ppid === undefined || stat === undefined) {
			continue;
		}
		rows.push({
			pid: Number(pid),
			ppid: Number(ppid),
			stat,
			args: args ?? "",
		});
	}
	return rows;
}

export function listPosixProcesses(): ProcessRow[] {
	const raw = execFileSync(
		"ps",
		["-A", "-ww", "-o", "pid=,ppid=,stat=,args="],
		{ encoding: "utf8" },
	);
	return parsePsRows(raw);
}

/** A pid is gone when absent or a zombie: kill(pid, 0) still succeeds on zombies. */
export function isGoneIn({
	rows,
	pid,
}: {
	rows: ProcessRow[];
	pid: number;
}): boolean {
	const row = rows.find((candidate) => candidate.pid === pid);
	return row === undefined || row.stat.startsWith("Z");
}

export async function pollUntilGone({
	pid,
	timeoutMs,
	intervalMs,
}: {
	pid: number;
	timeoutMs: number;
	intervalMs: number;
}): Promise<{ gone: boolean; elapsedMs: number }> {
	const start = Date.now();
	for (;;) {
		if (isGoneIn({ rows: listPosixProcesses(), pid })) {
			return { gone: true, elapsedMs: Date.now() - start };
		}
		if (Date.now() - start >= timeoutMs) {
			return { gone: false, elapsedMs: Date.now() - start };
		}
		await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
	}
}

function isInScopeStayOpen({
	row,
	scopeRoots,
}: {
	row: ProcessRow;
	scopeRoots: string[];
}): boolean {
	return (
		row.args.includes("-stay_open") &&
		row.args.includes("exiftool") &&
		scopeRoots.some((root) => row.args.includes(root))
	);
}

function descendsFrom({
	rows,
	row,
	ancestorPid,
}: {
	rows: ProcessRow[];
	row: ProcessRow;
	ancestorPid: number;
}): boolean {
	let current: ProcessRow | undefined = row;
	for (let step = 0; step < 64 && current !== undefined; step++) {
		if (current.ppid === ancestorPid) {
			return true;
		}
		if (current.ppid <= 1) {
			return false;
		}
		const parentPid: number = current.ppid;
		current = rows.find((candidate) => candidate.pid === parentPid);
	}
	return false;
}

/**
 * D-08 suite-wide leftover classifier: the exiftool `-stay_open` processes a vitest run
 * created and failed to end.
 *
 * Scope: args contain `-stay_open`, `exiftool` and a scope root (the repo or the temp dir),
 * so an installed ExifCleaner or a one-shot exiftool never counts. A row is a leftover only
 * when it is not a zombie, was not present at setup, and is either parented to a reaper (init
 * or the observed subreaper: an orphan) or descends from the runner (still owned by this run).
 * A row parented to any other live process is a concurrent app or dev session and is excluded,
 * so the gate cannot flake on a developer machine.
 */
export function classifyStayOpenLeftovers({
	rows,
	scopeRoots,
	preexisting,
	runnerPid,
	reaperPids,
}: {
	rows: ProcessRow[];
	scopeRoots: string[];
	preexisting: ReadonlySet<number>;
	runnerPid: number;
	reaperPids: ReadonlySet<number>;
}): ProcessRow[] {
	return rows.filter((row) => {
		if (!isInScopeStayOpen({ row, scopeRoots })) {
			return false;
		}
		if (row.stat.startsWith("Z") || preexisting.has(row.pid)) {
			return false;
		}
		return (
			reaperPids.has(row.ppid) ||
			descendsFrom({ rows, row, ancestorPid: runnerPid })
		);
	});
}

export interface WinProcessRow {
	pid: number;
	ppid: number;
	name: string;
	commandLine: string;
}

interface CimRecord {
	ProcessId?: unknown;
	ParentProcessId?: unknown;
	Name?: unknown;
	CommandLine?: unknown;
}

/**
 * Parses `ConvertTo-Json -Compress` output of Win32_Process rows. PowerShell emits a bare object
 * (not an array) for a single row and `null` for a process whose command line is unreadable.
 */
export function parseCimProcesses(raw: string): WinProcessRow[] {
	const text = raw.trim();
	if (text === "") {
		return [];
	}
	const parsed: unknown = JSON.parse(text);
	const records = (Array.isArray(parsed) ? parsed : [parsed]) as CimRecord[];
	return records.map((record) => ({
		pid: Number(record.ProcessId),
		ppid: Number(record.ParentProcessId),
		name: typeof record.Name === "string" ? record.Name : "",
		commandLine:
			typeof record.CommandLine === "string" ? record.CommandLine : "",
	}));
}

export function listWindowsProcesses(): WinProcessRow[] {
	const raw = execFileSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
		],
		{ encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
	);
	return parseCimProcesses(raw);
}

/** kill(pid, 0) probes without signalling: ESRCH is gone, EPERM is alive but not ours. */
export function isPidAliveWin32(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** Polls through kill(pid, 0): a CIM query costs 1-2 s on hosted runners, far above any interval here. */
export async function pollUntilGoneWin32({
	pid,
	timeoutMs,
	intervalMs,
}: {
	pid: number;
	timeoutMs: number;
	intervalMs: number;
}): Promise<{ gone: boolean; elapsedMs: number }> {
	const start = Date.now();
	for (;;) {
		if (!isPidAliveWin32(pid)) {
			return { gone: true, elapsedMs: Date.now() - start };
		}
		if (Date.now() - start >= timeoutMs) {
			return { gone: false, elapsedMs: Date.now() - start };
		}
		await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
	}
}

/** JSON contract of tests/integration/helpers/orphan_parent.ts. */
export interface OrphanParentSpec {
	mode: "class" | "raw";
	binPath: string;
	configPath?: string;
	readyFile?: string;
	parentPidEnv?: "self" | string;
	dieBeforeReady?: boolean;
	/** Raw mode: child stdout and stderr go to this file instead of pipes (FIFO write legs). */
	stdoutFile?: string;
	/** Raw mode, needs stdoutFile: after readiness, send a copy-mode write command. */
	inflightWrite?: { source: string; dest: string };
	/** Raw mode, forbids stdoutFile: after readiness, send an overwrite command over this dir. */
	inflightOverwriteDir?: string;
}

/**
 * Starts the detached tsx parent that hosts an ExifTool `-stay_open` child, waits for its
 * `{parentPid, childPid}` line, and pushes both pids (and the launcher pid) into `owned` so the
 * caller can sweep them. Shared by the vitest integration test and the installed-artifact smoke.
 */
export async function startOrphanParent({
	spec,
	repoRoot,
	owned,
}: {
	spec: OrphanParentSpec;
	repoRoot: string;
	owned: number[];
}): Promise<{ parentPid: number; childPid: number }> {
	const proc = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			path.join(repoRoot, "tests/integration/helpers/orphan_parent.ts"),
			JSON.stringify(spec),
		],
		{ cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
	);
	if (proc.pid !== undefined) {
		owned.push(proc.pid);
	}
	let stdout = "";
	let stderr = "";
	proc.stderr.setEncoding("utf8");
	proc.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	proc.stdout.setEncoding("utf8");
	const started = await new Promise<{ parentPid: number; childPid: number }>(
		(resolve, reject) => {
			const timer = setTimeout(() => {
				reject(
					new Error(`orphan parent did not report within 15 s: ${stderr}`),
				);
			}, 15_000);
			proc.stdout.on("data", (chunk: string) => {
				stdout += chunk;
				const line = stdout.split("\n").find((l) => l.startsWith("{"));
				if (line !== undefined) {
					clearTimeout(timer);
					resolve(JSON.parse(line) as { parentPid: number; childPid: number });
				}
			});
			proc.once("exit", () => {
				clearTimeout(timer);
				reject(new Error(`orphan parent exited early: ${stderr}`));
			});
		},
	);
	owned.push(started.parentPid, started.childPid);
	return started;
}
