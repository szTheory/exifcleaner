import { spawn, type ChildProcess } from "node:child_process";
import type { ExifToolResult, ExifToolCloseResult } from "./types";

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

	constructor(binPath: string) {
		this.binPath = binPath;
	}

	async open(): Promise<number> {
		if (this.process) {
			throw new Error("ExifTool process is already open");
		}

		const proc = spawn(this.binPath, ["-stay_open", "True", "-@", "-"]);
		this.process = proc;

		// Handle spawn errors
		proc.on("error", (err) => {
			console.error("ExifTool process error:", err);
			this.rejectAllPending(err);
			this.process = null;
		});

		// Handle unexpected exit
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

		// Handle stdout
		proc.stdout?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			this.parseStdout(chunk);
		});

		// Handle stderr (log for debugging)
		proc.stderr?.setEncoding("utf8");
		proc.stderr?.on("data", (chunk: string) => {
			this.stderrBuffer += chunk;
			// Log stderr in case of issues
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

		// Send graceful shutdown command
		try {
			proc.stdin?.write("-stay_open\nFalse\n");
			proc.stdin?.end();
		} catch (err) {
			console.error("Error sending close command to ExifTool:", err);
		}

		// Wait for exit with timeout
		const exitPromise = new Promise<{ success: boolean; error: Error | null }>(
			(resolve) => {
				const timeout = setTimeout(() => {
					console.warn(
						"ExifTool did not exit gracefully, killing process",
					);
					proc.kill();
					resolve({
						success: false,
						error: new Error("ExifTool process did not exit in time"),
					});
				}, 5000);

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

	async readMetadata(
		filePath: string,
		args: string[],
	): Promise<ExifToolResult> {
		if (!this.process || !this.process.stdin) {
			throw new Error("ExifTool process is not open");
		}

		const executeNum = this.executeCounter++;
		const command = ["-json", ...args, filePath, `-execute${executeNum}`].join(
			"\n",
		);

		return this.sendCommand(executeNum, command);
	}

	async writeMetadata(
		filePath: string,
		metadata: Record<string, unknown>,
		extraArgs: string[],
		debug: boolean,
	): Promise<ExifToolResult> {
		if (!this.process || !this.process.stdin) {
			throw new Error("ExifTool process is not open");
		}

		const executeNum = this.executeCounter++;

		// Build metadata args (e.g., "-all=" to clear all metadata)
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

		return this.sendCommand(executeNum, command);
	}

	private sendCommand(
		executeNum: number,
		command: string,
	): Promise<ExifToolResult> {
		return new Promise((resolve, reject) => {
			// Set 30s timeout for command
			const timeout = setTimeout(() => {
				this.pendingCommands.delete(executeNum);
				reject(
					new Error(
						`ExifTool command timed out (execute ${executeNum})`,
					),
				);
			}, 30000);

			this.pendingCommands.set(executeNum, { resolve, reject, timeout });

			// Safe: process and stdin guaranteed non-null — sendCommand validates
			// this.process !== null (line 126) and stdin exists on spawned processes
			this.process!.stdin!.write(command + "\n");
		});
	}

	private parseStdout(chunk: string): void {
		this.stdoutBuffer += chunk;

		// Look for {ready<N>} markers
		const readyRegex = /\{ready(\d+)\}/g;
		let match: RegExpExecArray | null;

		while ((match = readyRegex.exec(this.stdoutBuffer)) !== null) {
			const executeNum = parseInt(match[1], 10);
			const markerIndex = match.index;

			// Extract JSON up to the marker
			const jsonStr = this.stdoutBuffer.substring(0, markerIndex).trim();

			// Remove processed data from buffer (including {ready<N>}\n\n)
			this.stdoutBuffer = this.stdoutBuffer.substring(
				markerIndex + match[0].length,
			);
			// Skip trailing newlines after {ready}
			this.stdoutBuffer = this.stdoutBuffer.replace(/^\s+/, "");

			// Reset regex index since we modified the buffer
			readyRegex.lastIndex = 0;

			// Resolve the pending promise
			const pending = this.pendingCommands.get(executeNum);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingCommands.delete(executeNum);

				// Check if output is JSON (starts with [ or {) or plain text
				const isJson = jsonStr.trimStart().startsWith('[') || jsonStr.trimStart().startsWith('{');

				if (isJson) {
					try {
						const parsed = JSON.parse(jsonStr);
						// Check if the result contains an error
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
				} else {
					// Plain text response (e.g., from write operations)
					// Check for error messages in the text
					if (jsonStr.toLowerCase().includes('error')) {
						pending.resolve({
							data: null,
							error: jsonStr.trim(),
						});
					} else {
						// Success - return empty data with no error
						pending.resolve({ data: null, error: null });
					}
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
