import { spawn, type ChildProcess } from "node:child_process";
import type { ExifToolResult, ExifToolCloseResult } from "./types";

const EXIFTOOL_CLOSE_TIMEOUT_MS = 5000;
const EXIFTOOL_COMMAND_TIMEOUT_MS = 30000;

interface CommandResolver {
	resolve: (result: ExifToolResult) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

export class ExiftoolProcess {
	private readonly binPath: string;
	private process: ChildProcess | null = null;
	private executeCounter = 0;
	private pendingCommands = new Map<number, CommandResolver>();
	private stdoutBuffer = "";
	private stderrBuffer = "";

	constructor({ binPath }: { binPath: string }) {
		this.binPath = binPath;
	}

	async open(): Promise<number> {
		if (this.process) {
			throw new Error("ExifTool process is already open");
		}

		const proc = spawn(this.binPath, ["-stay_open", "True", "-@", "-"]);
		this.process = proc;

		proc.on("error", (err) => {
			console.error("ExifTool process error:", err);
			this.rejectAllPending(err);
			this.process = null;
		});

		proc.on("exit", (code, signal) => {
			if (this.pendingCommands.size > 0) {
				console.error(
					`ExifTool exited unexpectedly with code ${code}, signal ${signal}`,
				);
				this.rejectAllPending(
					new Error(
						`ExifTool process exited unexpectedly (code: ${code}, signal: ${signal})`,
					),
				);
			}
			this.process = null;
		});

		proc.stdout?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			this.parseStdout(chunk);
		});

		proc.stderr?.setEncoding("utf8");
		proc.stderr?.on("data", (chunk: string) => {
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
		});

		if (!proc.pid) {
			throw new Error("Failed to spawn ExifTool process");
		}

		return proc.pid;
	}

	async close(): Promise<ExifToolCloseResult> {
		if (!this.process) {
			return { success: true, error: null };
		}

		const proc = this.process;

		try {
			proc.stdin?.write("-stay_open\nFalse\n");
			proc.stdin?.end();
		} catch (err) {
			console.error("Error sending close command to ExifTool:", err);
		}

		const exitPromise = new Promise<{ success: boolean; error: Error | null }>(
			(resolve) => {
				const timeout = setTimeout(() => {
					console.warn("ExifTool did not exit gracefully, killing process");
					proc.kill();
					resolve({
						success: false,
						error: new Error("ExifTool process did not exit in time"),
					});
				}, EXIFTOOL_CLOSE_TIMEOUT_MS);

				proc.on("exit", () => {
					clearTimeout(timeout);
					resolve({ success: true, error: null });
				});
			},
		);

		this.process = null;
		this.pendingCommands.clear();
		return exitPromise;
	}

	async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<ExifToolResult> {
		if (!this.process || !this.process.stdin) {
			throw new Error("ExifTool process is not open");
		}

		const executeNum = this.executeCounter++;
		const command = ["-json", ...args, filePath, `-execute${executeNum}`].join(
			"\n",
		);

		return this.sendCommand({ executeNum, command });
	}

	async writeMetadata({
		filePath,
		metadata,
		extraArgs,
	}: {
		filePath: string;
		metadata: Record<string, unknown>;
		extraArgs: string[];
	}): Promise<ExifToolResult> {
		if (!this.process || !this.process.stdin) {
			throw new Error("ExifTool process is not open");
		}

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

		return this.sendCommand({ executeNum, command });
	}

	private sendCommand({
		executeNum,
		command,
	}: {
		executeNum: number;
		command: string;
	}): Promise<ExifToolResult> {
		if (!this.process || !this.process.stdin) {
			throw new Error(
				"ExifTool process is not open. Call open() before sending commands.",
			);
		}

		const stdin = this.process.stdin;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingCommands.delete(executeNum);
				reject(new Error(`ExifTool command timed out (execute ${executeNum})`));
			}, EXIFTOOL_COMMAND_TIMEOUT_MS);

			this.pendingCommands.set(executeNum, { resolve, reject, timeout });

			stdin.write(command + "\n");
		});
	}

	private parseStdout(chunk: string): void {
		this.stdoutBuffer += chunk;

		const readyRegex = /\{ready(\d+)\}/g;
		let match: RegExpExecArray | null;

		while ((match = readyRegex.exec(this.stdoutBuffer)) !== null) {
			const marker = match[1];
			if (marker === undefined) {
				continue;
			}
			const executeNum = parseInt(marker, 10);
			const markerIndex = match.index;

			const jsonStr = this.stdoutBuffer.substring(0, markerIndex).trim();

			this.stdoutBuffer = this.stdoutBuffer.substring(
				markerIndex + match[0].length,
			);
			this.stdoutBuffer = this.stdoutBuffer.replace(/^\s+/, "");

			// Reset regex lastIndex since we modified the buffer
			readyRegex.lastIndex = 0;

			const pending = this.pendingCommands.get(executeNum);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingCommands.delete(executeNum);

				const isJson =
					jsonStr.trimStart().startsWith("[") ||
					jsonStr.trimStart().startsWith("{");

				if (isJson) {
					try {
						const parsed = JSON.parse(jsonStr);
						if (Array.isArray(parsed) && parsed.length > 0) {
							const firstItem = parsed[0];
							if (
								firstItem &&
								typeof firstItem === "object" &&
								"Error" in firstItem
							) {
								pending.resolve({
									data: null,
									error: String(firstItem.Error),
								});
							} else {
								pending.resolve({ data: parsed, error: null });
							}
						} else {
							pending.resolve({ data: parsed, error: null });
						}
					} catch (err) {
						pending.resolve({
							data: null,
							error: `Failed to parse ExifTool output: ${err instanceof Error ? err.message : String(err)}`,
						});
					}
				} else if (jsonStr.toLowerCase().includes("error")) {
					pending.resolve({
						data: null,
						error: jsonStr.trim(),
					});
				} else {
					pending.resolve({ data: null, error: null });
				}
			}
		}
	}

	private rejectAllPending(error: Error): void {
		for (const [executeNum, pending] of this.pendingCommands.entries()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pendingCommands.clear();
	}
}
