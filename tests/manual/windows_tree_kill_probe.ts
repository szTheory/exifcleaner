// D-68 Windows process-tree kill proof (Phase 53.1, LRG-03).
//
// Run by the `build-windows` CI step through:
//   yarn tsx tests/manual/windows_tree_kill_probe.ts
//
// This is deliberately NOT a vitest test (no `.test.ts` / `.spec.ts` / `.smoke.ts` suffix).
// `scripts/known_gap_gate.mjs` and `scripts/dir_effect_gate.mjs` collect only
// `tests/**/*.test.*`, `tests/e2e/**/*.spec.*` and `tests/smoke/**/*.smoke.*`, so this file is
// never collected and never skipped by construction -- no skipIf/runIf is used anywhere here.
//
// It drives the product's own ExiftoolProcess against `.resources/win/bin/exiftool.exe`, which
// is a "tiny launcher" wrapping a separate `perl.exe` child (RESEARCH Pattern 3, cited but never
// executed until this probe). It proves: (1) the launcher spawns a perl.exe descendant, (2) a
// writeMetadata deadline produces an ExifToolCommandTimeoutError, (3) by the moment that
// rejection arrives, the whole tree (launcher + perl.exe) is already dead, (4) a fresh session
// respawns and can read successfully, (5) close() leaves no survivors. It also measures --
// never asserts -- whether a plain launcher-only kill would have left perl.exe running
// (PLAIN_KILL_LEAVES_PERL), as a negative control for the tree-kill claim above.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	ExifToolCommandTimeoutError,
	ExiftoolProcess,
} from "../../src/infrastructure/exiftool/ExiftoolProcess";

if (process.platform !== "win32") {
	console.log("PROBE_UNSUPPORTED_PLATFORM");
	process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH = path.resolve(
	__dirname,
	"../../.resources/win/bin/exiftool.exe",
);
const SAMPLE_JPEG_PATH = path.resolve(__dirname, "../e2e/fixtures/sample.jpg");

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 10_000;

type WinProcessInfo = { pid: number; ppid: number; name: string };

function listProcesses(): WinProcessInfo[] {
	const raw = execFileSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
		],
		{ encoding: "utf8" },
	);
	const parsed: unknown = JSON.parse(raw);
	const rows = Array.isArray(parsed) ? parsed : [parsed];
	return rows.map((row) => {
		const record = row as Record<string, unknown>;
		return {
			pid: Number(record.ProcessId),
			ppid: Number(record.ParentProcessId),
			name: String(record.Name ?? ""),
		};
	});
}

function descendantsOf(pid: number): WinProcessInfo[] {
	const all = listProcesses();
	const result: WinProcessInfo[] = [];
	const frontier = [pid];
	while (frontier.length > 0) {
		const current = frontier.pop();
		if (current === undefined) {
			continue;
		}
		for (const proc of all) {
			if (proc.ppid === current) {
				result.push(proc);
				frontier.push(proc.pid);
			}
		}
	}
	return result;
}

function alive(pids: number[]): number[] {
	if (pids.length === 0) {
		return [];
	}
	const livePids = new Set(listProcesses().map((proc) => proc.pid));
	return pids.filter((pid) => livePids.has(pid));
}

async function sleep(ms: number): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function pollUntil<T>({
	fn,
	predicate,
	timeoutMs,
}: {
	fn: () => T;
	predicate: (value: T) => boolean;
	timeoutMs: number;
}): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let value = fn();
	while (!predicate(value) && Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		value = fn();
	}
	return value;
}

function isPerl(name: string): boolean {
	return name.toLowerCase().includes("perl.exe");
}

async function main(): Promise<void> {
	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "gsd531-06-windows-tree-kill-"),
	);
	const copyPath = path.join(tempDir, "sample.jpg");
	fs.copyFileSync(SAMPLE_JPEG_PATH, copyPath);

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	let opened = false;

	try {
		// Step 1: open the product's ExiftoolProcess and confirm a baseline read works.
		await exiftoolProcess.open();
		opened = true;
		const baselineRead = await exiftoolProcess.readMetadata({
			filePath: copyPath,
			args: ["-FileType"],
		});
		if (baselineRead.error !== null) {
			console.log(
				`PROBE_WRONG_ERROR=baseline read failed: ${baselineRead.error}`,
			);
			process.exit(1);
		}

		// Step 2: the launcher must spawn a perl.exe descendant.
		const launcherPid = exiftoolProcess.pid;
		if (launcherPid === undefined) {
			console.log("PROBE_NO_PERL_CHILD");
			process.exit(1);
		}
		const sessionDescendants = await pollUntil({
			fn: () => descendantsOf(launcherPid),
			predicate: (descendants) => descendants.some((d) => isPerl(d.name)),
			timeoutMs: POLL_TIMEOUT_MS,
		});
		console.log(`PROBE_SESSION_TREE=${JSON.stringify(sessionDescendants)}`);
		if (!sessionDescendants.some((d) => isPerl(d.name))) {
			console.log("PROBE_NO_PERL_CHILD");
			process.exit(1);
		}
		const sessionDescendantPids = sessionDescendants.map((d) => d.pid);

		// Step 3: force a deadline on a write command.
		let timeoutErrorSeen = false;
		try {
			const result = await exiftoolProcess.writeMetadata({
				filePath: copyPath,
				metadata: {},
				extraArgs: ["-all=", "-overwrite_original"],
				deadlineMs: 1,
			});
			console.log(`PROBE_DEADLINE_NOT_REACHED=${JSON.stringify(result)}`);
			process.exit(1);
		} catch (error: unknown) {
			if (!(error instanceof ExifToolCommandTimeoutError)) {
				console.log(`PROBE_WRONG_ERROR=${String(error)}`);
				process.exit(1);
			}
			timeoutErrorSeen = true;
			console.log(`PROBE_TIMEOUT_ERROR=${error.name}`);
		}
		if (!timeoutErrorSeen) {
			console.log("PROBE_WRONG_ERROR=no error thrown");
			process.exit(1);
		}

		// Step 4: immediately after the rejection, the whole recorded tree must already be dead.
		const survivorsAfterTimeout = alive([
			launcherPid,
			...sessionDescendantPids,
		]);
		console.log(
			`PROBE_TREE_AFTER_TIMEOUT=${JSON.stringify(survivorsAfterTimeout)}`,
		);
		if (survivorsAfterTimeout.length > 0) {
			console.log("PROBE_TREE_SURVIVED");
			process.exit(1);
		}

		// Step 5: a fresh session must respawn and be able to read.
		const respawnedPid = await pollUntil({
			fn: () => exiftoolProcess.pid,
			predicate: (pid) => pid !== undefined && pid !== launcherPid,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		console.log(`PROBE_RESPAWNED_PID=${String(respawnedPid)}`);
		if (respawnedPid === undefined || respawnedPid === launcherPid) {
			console.log("PROBE_WRONG_ERROR=respawn did not produce a new pid");
			process.exit(1);
		}
		const respawnRead = await exiftoolProcess.readMetadata({
			filePath: copyPath,
			args: ["-FileType"],
		});
		if (respawnRead.error !== null) {
			console.log(
				`PROBE_WRONG_ERROR=respawn read failed: ${respawnRead.error}`,
			);
			process.exit(1);
		}
		console.log("PROBE_RESPAWN_READ_OK");

		// Step 6: record the new tree and close(); it must leave no survivors.
		const newSessionDescendants = descendantsOf(respawnedPid);
		const newTreePids = [
			respawnedPid,
			...newSessionDescendants.map((d) => d.pid),
		];
		await exiftoolProcess.close();
		opened = false;
		const survivorsAfterClose = await pollUntil({
			fn: () => alive(newTreePids),
			predicate: (survivors) => survivors.length === 0,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		console.log(
			`PROBE_TREE_AFTER_CLOSE=${JSON.stringify(survivorsAfterClose)}`,
		);
		if (survivorsAfterClose.length > 0) {
			console.log("PROBE_CLOSE_TREE_SURVIVED");
			process.exit(1);
		}

		// Step 7: control. Spawn exiftool.exe directly and kill only the launcher (no tree
		// kill). Measure -- never assert -- whether perl.exe survives that plain kill.
		let controlProc: ChildProcess | undefined;
		let controlPerlPid: number | undefined;
		try {
			controlProc = spawn(EXIFTOOL_PATH, ["-stay_open", "True", "-@", "-"]);
			const controlLauncherPid = controlProc.pid;
			if (controlLauncherPid !== undefined) {
				const controlDescendants = await pollUntil({
					fn: () => descendantsOf(controlLauncherPid),
					predicate: (descendants) => descendants.some((d) => isPerl(d.name)),
					timeoutMs: POLL_TIMEOUT_MS,
				});
				const perlDescendant = controlDescendants.find((d) => isPerl(d.name));
				controlPerlPid = perlDescendant?.pid;

				controlProc.kill();
				await new Promise<void>((resolve) => {
					if (controlProc === undefined) {
						resolve();
						return;
					}
					controlProc.once("exit", () => resolve());
				});
				await sleep(2000);

				const perlSurvived =
					controlPerlPid !== undefined && alive([controlPerlPid]).length > 0;
				console.log(`PLAIN_KILL_LEAVES_PERL=${perlSurvived}`);
			} else {
				console.log("PLAIN_KILL_LEAVES_PERL=false");
			}
		} finally {
			// Never fail the probe on this measurement -- clean up any survivor.
			try {
				if (controlPerlPid !== undefined) {
					const stillAlive = alive([controlPerlPid]);
					if (stillAlive.length > 0) {
						execFileSync("taskkill", ["/pid", String(controlPerlPid), "/F"]);
					}
				}
			} catch {
				// best-effort cleanup only
			}
			try {
				if (controlProc !== undefined && controlProc.exitCode === null) {
					controlProc.kill();
				}
			} catch {
				// best-effort cleanup only
			}
		}

		console.log("WINDOWS_TREE_KILL_PROOF_OK");
		process.exit(0);
	} finally {
		if (opened) {
			try {
				await exiftoolProcess.close();
			} catch {
				// already closed or never opened -- nothing else to do here.
			}
		}
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
