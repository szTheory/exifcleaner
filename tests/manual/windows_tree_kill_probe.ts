// D-68 Windows timeout-kill proof (Phase 53.1, LRG-03).
//
// Run by the `build-windows` CI step through:
//   yarn tsx tests/manual/windows_tree_kill_probe.ts
//
// This is deliberately NOT a vitest test (no `.test.ts` / `.spec.ts` / `.smoke.ts` suffix).
// `scripts/known_gap_gate.mjs` and `scripts/dir_effect_gate.mjs` collect only
// `tests/**/*.test.*`, `tests/e2e/**/*.spec.*` and `tests/smoke/**/*.smoke.*`, so this file is
// never collected and never skipped by construction -- no skipIf/runIf is used anywhere here.
//
// Premise (traced, amended 2026-09-23 per maintainer decision (a)): the bundled
// `.resources/win/bin/exiftool.exe` is Oliver Betz's tiny launcher. Its static strings show
// `LoadLibraryA`, `exiftool_files\perl5*.dll`, `RunPerl` and no CreateProcess/ShellExecute/spawn
// strings: it loads perl532.dll and runs exiftool.pl INSIDE its own process. `perl.exe` is only
// the argv[0] it builds, so no perl.exe child process exists. CI runs 35944821668 and
// 35946031910 measured the same (no perl.exe anywhere while the launcher was alive and
// answering). The earlier premise -- a launcher wrapping a separate perl.exe child -- is
// superseded.
//
// This probe drives the product's own ExiftoolProcess and requires, each failure exiting 1
// with a named marker:
//   1. In-process Perl is asserted, not assumed: while a command is provably in flight, the
//      launcher has no perl.exe descendant (PERL_IN_PROCESS=true). A perl.exe descendant fails
//      with PROBE_UNEXPECTED_PERL_CHILD -- the package changed and the kill premise must be
//      revisited. The process walk is first proven able to see a child at all (it must find
//      the launcher under this node process), so "no descendant" is never vacuous.
//   2. writeMetadata({ ..., deadlineMs: 1 }) rejects with ExifToolCommandTimeoutError, and at
//      that moment the launcher and every recorded descendant are gone.
//   3. The write target (and any `_exiftool_tmp` leftover) is deletable immediately after the
//      rejection: fs.rmSync raises no EBUSY/EPERM, so no process holds the file.
//   4. A fresh session (new pid) serves a read; after close() that pid is gone.
// It prints WINDOWS_TREE_KILL_PROOF_OK only if all four held. It also measures -- never
// asserts -- a negative control: exiftool.exe spawned directly and ended with a plain
// `proc.kill()` (PLAIN_KILL_LEAVES_PERL=true|false).
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
// ExifTool evaluates an `-if` condition as Perl, so `sleep(N)` holds one command in flight for
// at least N seconds. A snapshot that ends before dispatch + N s was provably taken while the
// command was still being served.
const IN_FLIGHT_SLEEP_S = 6;
const IN_FLIGHT_SLEEP_MS = IN_FLIGHT_SLEEP_S * 1000;
const IN_FLIGHT_SNAPSHOT_MARGIN_MS = 1000;

type WinProcessInfo = { pid: number; ppid: number; name: string };

class ProbeFailure extends Error {
	readonly marker: string;
	constructor({
		marker,
		detail,
	}: {
		marker: string;
		detail?: string | undefined;
	}) {
		super(detail === undefined ? marker : `${marker}: ${detail}`);
		this.marker = marker;
	}
}

function fail({
	marker,
	detail,
}: {
	marker: string;
	detail?: string | undefined;
}): never {
	throw new ProbeFailure({ marker, detail });
}

function listProcesses(): WinProcessInfo[] {
	const raw = execFileSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
		],
		{ encoding: "utf8", windowsHide: true },
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

function descendantsIn({
	snapshot,
	rootPid,
}: {
	snapshot: WinProcessInfo[];
	rootPid: number;
}): WinProcessInfo[] {
	const result: WinProcessInfo[] = [];
	const seen = new Set<number>([rootPid]);
	const frontier = [rootPid];
	while (frontier.length > 0) {
		const current = frontier.pop();
		if (current === undefined) {
			continue;
		}
		for (const proc of snapshot) {
			if (proc.ppid === current && !seen.has(proc.pid)) {
				seen.add(proc.pid);
				result.push(proc);
				frontier.push(proc.pid);
			}
		}
	}
	return result;
}

function aliveIn({
	snapshot,
	pids,
}: {
	snapshot: WinProcessInfo[];
	pids: number[];
}): number[] {
	const livePids = new Set(snapshot.map((proc) => proc.pid));
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
	return name.toLowerCase() === "perl.exe";
}

function isLauncher(name: string): boolean {
	return name.toLowerCase() === "exiftool.exe";
}

// Measured only, never asserted: which perl DLLs the (32-bit) launcher has loaded. A 64-bit
// PowerShell cannot enumerate a WOW64 process's 32-bit modules, so the 32-bit host is used.
function measureLauncherPerlModules(pid: number): string {
	const windir = process.env.SystemRoot ?? "C:\\Windows";
	const ps32 = path.join(
		windir,
		"SysWOW64",
		"WindowsPowerShell",
		"v1.0",
		"powershell.exe",
	);
	try {
		const raw = execFileSync(
			ps32,
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				`(Get-Process -Id ${pid}).Modules | Where-Object { $_.ModuleName -like 'perl5*.dll' } | ForEach-Object { $_.ModuleName } | ConvertTo-Json -Compress`,
			],
			{ encoding: "utf8", windowsHide: true, timeout: 60_000 },
		).trim();
		return raw === "" ? "[]" : raw;
	} catch (error: unknown) {
		return `unavailable:${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
	}
}

async function proveInProcessPerl({
	exiftoolProcess,
	launcherPid,
	readPath,
}: {
	exiftoolProcess: ExiftoolProcess;
	launcherPid: number;
	readPath: string;
}): Promise<number[]> {
	// Positive control: the walk must see this node process's own child, the launcher.
	const baseline = listProcesses();
	const launcherUnderNode = descendantsIn({
		snapshot: baseline,
		rootPid: process.pid,
	}).find((proc) => proc.pid === launcherPid);
	if (launcherUnderNode === undefined || !isLauncher(launcherUnderNode.name)) {
		fail({
			marker: "PROBE_WALK_BLIND",
			detail: `launcher ${launcherPid} not found under node ${process.pid}`,
		});
	}
	console.log(`PROBE_WALK_SEES_LAUNCHER=${JSON.stringify(launcherUnderNode)}`);

	let settled = false;
	const dispatchedAt = Date.now();
	const inFlightRead = exiftoolProcess
		.readMetadata({
			filePath: readPath,
			args: ["-if", `sleep(${IN_FLIGHT_SLEEP_S})`, "-FileType"],
		})
		.finally(() => {
			settled = true;
		});

	const recorded = new Map<number, WinProcessInfo>();
	let inFlightSnapshots = 0;
	while (
		Date.now() - dispatchedAt <
		IN_FLIGHT_SLEEP_MS - IN_FLIGHT_SNAPSHOT_MARGIN_MS
	) {
		const snapshot = listProcesses();
		const snapshotEndMs = Date.now() - dispatchedAt;
		if (settled || snapshotEndMs >= IN_FLIGHT_SLEEP_MS) {
			break;
		}
		if (!snapshot.some((proc) => proc.pid === launcherPid)) {
			fail({
				marker: "PROBE_LAUNCHER_NOT_OBSERVED",
				detail: `launcher ${launcherPid} missing from an in-flight snapshot`,
			});
		}
		const tree = descendantsIn({ snapshot, rootPid: launcherPid });
		for (const proc of tree) {
			recorded.set(proc.pid, proc);
		}
		inFlightSnapshots += 1;
		const perlChildren = tree.filter((proc) => isPerl(proc.name));
		if (perlChildren.length > 0) {
			fail({
				marker: "PROBE_UNEXPECTED_PERL_CHILD",
				detail: JSON.stringify(perlChildren),
			});
		}
		await sleep(POLL_INTERVAL_MS);
	}

	const inFlightResult = await inFlightRead;
	const inFlightMs = Date.now() - dispatchedAt;
	if (inFlightResult.error !== null) {
		fail({
			marker: "PROBE_WRONG_ERROR",
			detail: `in-flight read failed: ${inFlightResult.error}`,
		});
	}
	const fileType = inFlightResult.data?.[0]?.FileType;
	console.log(`PROBE_INFLIGHT_MS=${inFlightMs}`);
	console.log(`PROBE_INFLIGHT_SNAPSHOTS=${inFlightSnapshots}`);
	if (inFlightMs < IN_FLIGHT_SLEEP_MS || fileType !== "JPEG") {
		fail({
			marker: "PROBE_NOT_IN_FLIGHT",
			detail: `read took ${inFlightMs} ms, FileType=${String(fileType)}`,
		});
	}
	if (inFlightSnapshots === 0) {
		fail({
			marker: "PROBE_NOT_IN_FLIGHT",
			detail: "no snapshot completed while the command was in flight",
		});
	}
	const tree = [...recorded.values()];
	console.log(`PROBE_SESSION_TREE=${JSON.stringify(tree)}`);
	console.log("PERL_IN_PROCESS=true");
	console.log(
		`PROBE_LAUNCHER_PERL_MODULES=${measureLauncherPerlModules(launcherPid)}`,
	);
	return tree.map((proc) => proc.pid);
}

async function proveDeadlineKill({
	exiftoolProcess,
	launcherPid,
	recordedDescendantPids,
	tempDir,
	writeTargetName,
}: {
	exiftoolProcess: ExiftoolProcess;
	launcherPid: number;
	recordedDescendantPids: number[];
	tempDir: string;
	writeTargetName: string;
}): Promise<void> {
	const writeTargetPath = path.join(tempDir, writeTargetName);
	let rejection: unknown = undefined;
	try {
		const result = await exiftoolProcess.writeMetadata({
			filePath: writeTargetPath,
			metadata: {},
			extraArgs: ["-all=", "-overwrite_original"],
			deadlineMs: 1,
		});
		fail({
			marker: "PROBE_DEADLINE_NOT_REACHED",
			detail: JSON.stringify(result),
		});
	} catch (error: unknown) {
		if (error instanceof ProbeFailure) {
			throw error;
		}
		rejection = error;
	}

	// Immediately: the target and any leftover must be deletable (no process holds them).
	const writeFiles = fs
		.readdirSync(tempDir)
		.filter((name) => name.startsWith(writeTargetName));
	console.log(`PROBE_WRITE_FILES_AT_REJECT=${JSON.stringify(writeFiles)}`);
	if (!(rejection instanceof ExifToolCommandTimeoutError)) {
		fail({ marker: "PROBE_WRONG_ERROR", detail: String(rejection) });
	}
	if (writeFiles.length === 0) {
		fail({
			marker: "PROBE_NO_FILE_TO_DELETE",
			detail: `nothing named ${writeTargetName}* in ${tempDir}`,
		});
	}
	for (const name of writeFiles) {
		const filePath = path.join(tempDir, name);
		try {
			fs.rmSync(filePath);
		} catch (error: unknown) {
			const code = (error as NodeJS.ErrnoException).code ?? String(error);
			fail({ marker: "PROBE_FILE_HELD", detail: `${name}:${code}` });
		}
		if (fs.existsSync(filePath)) {
			fail({ marker: "PROBE_FILE_HELD", detail: `${name}:still-present` });
		}
	}
	console.log(`PROBE_TIMEOUT_ERROR=${rejection.name}`);
	console.log(`PROBE_OUTPUT_RELEASED=${JSON.stringify(writeFiles)}`);

	// And at that same moment the whole recorded tree must already be gone, with no orphan
	// still parented to the dead launcher.
	const snapshot = listProcesses();
	const survivors = aliveIn({
		snapshot,
		pids: [launcherPid, ...recordedDescendantPids],
	});
	const orphans = descendantsIn({ snapshot, rootPid: launcherPid });
	console.log(
		`PROBE_TREE_AFTER_TIMEOUT=${JSON.stringify({ survivors, orphans })}`,
	);
	if (survivors.length > 0 || orphans.length > 0) {
		fail({
			marker: "PROBE_TREE_SURVIVED",
			detail: JSON.stringify({ survivors, orphans }),
		});
	}
}

async function proveRespawnAndClose({
	exiftoolProcess,
	launcherPid,
	readPath,
}: {
	exiftoolProcess: ExiftoolProcess;
	launcherPid: number;
	readPath: string;
}): Promise<void> {
	const respawnedPid = await pollUntil({
		fn: () => exiftoolProcess.pid,
		predicate: (pid) => pid !== undefined && pid !== launcherPid,
		timeoutMs: POLL_TIMEOUT_MS,
	});
	console.log(`PROBE_RESPAWNED_PID=${String(respawnedPid)}`);
	if (respawnedPid === undefined || respawnedPid === launcherPid) {
		fail({
			marker: "PROBE_WRONG_ERROR",
			detail: "respawn did not produce a new pid",
		});
	}
	const respawnRead = await exiftoolProcess.readMetadata({
		filePath: readPath,
		args: ["-FileType"],
	});
	if (
		respawnRead.error !== null ||
		respawnRead.data?.[0]?.FileType !== "JPEG"
	) {
		fail({
			marker: "PROBE_WRONG_ERROR",
			detail: `respawn read failed: ${String(respawnRead.error)}`,
		});
	}
	console.log("PROBE_RESPAWN_READ_OK");

	const newTree = descendantsIn({
		snapshot: listProcesses(),
		rootPid: respawnedPid,
	});
	const newPerl = newTree.filter((proc) => isPerl(proc.name));
	if (newPerl.length > 0) {
		fail({
			marker: "PROBE_UNEXPECTED_PERL_CHILD",
			detail: JSON.stringify(newPerl),
		});
	}
	const newTreePids = [respawnedPid, ...newTree.map((proc) => proc.pid)];
	await exiftoolProcess.close();
	const survivorsAfterClose = await pollUntil({
		fn: () => aliveIn({ snapshot: listProcesses(), pids: newTreePids }),
		predicate: (survivors) => survivors.length === 0,
		timeoutMs: POLL_TIMEOUT_MS,
	});
	console.log(`PROBE_TREE_AFTER_CLOSE=${JSON.stringify(survivorsAfterClose)}`);
	if (survivorsAfterClose.length > 0) {
		fail({
			marker: "PROBE_CLOSE_TREE_SURVIVED",
			detail: JSON.stringify(survivorsAfterClose),
		});
	}
}

// Negative control, measured and never asserted: spawn exiftool.exe directly, put one command
// in flight, end it with a plain launcher-only kill, and record whether any perl.exe that was
// a descendant survives. Only pids recorded as this control launcher's descendants are ever
// cleaned up (T-53.1-19).
async function measurePlainKillControl({
	readPath,
}: {
	readPath: string;
}): Promise<void> {
	let controlProc: ChildProcess | undefined;
	const recorded = new Map<number, WinProcessInfo>();
	try {
		controlProc = spawn(EXIFTOOL_PATH, ["-stay_open", "True", "-@", "-"], {
			windowsHide: true,
		});
		controlProc.stdout?.resume();
		controlProc.stderr?.resume();
		const controlPid = controlProc.pid;
		if (controlPid === undefined) {
			console.log("PLAIN_KILL_CONTROL_SPAWN=failed");
			console.log("PLAIN_KILL_LEAVES_PERL=false");
			return;
		}
		controlProc.stdin?.write(
			["-if", `sleep(${IN_FLIGHT_SLEEP_S})`, "-FileType", readPath, "-execute1"]
				.map((line) => `${line}\n`)
				.join(""),
		);
		const startedAt = Date.now();
		while (Date.now() - startedAt < 2000) {
			const snapshot = listProcesses();
			for (const proc of descendantsIn({ snapshot, rootPid: controlPid })) {
				recorded.set(proc.pid, proc);
			}
			await sleep(POLL_INTERVAL_MS);
		}
		console.log(
			`PLAIN_KILL_CONTROL_TREE=${JSON.stringify([...recorded.values()])}`,
		);

		const exited = new Promise<void>((resolve) => {
			if (controlProc === undefined || controlProc.exitCode !== null) {
				resolve();
				return;
			}
			controlProc.once("exit", () => resolve());
		});
		controlProc.kill();
		await exited;
		await sleep(2000);

		const snapshot = listProcesses();
		const recordedPerl = [...recorded.values()]
			.filter((proc) => isPerl(proc.name))
			.map((proc) => proc.pid);
		const survivingPerl = aliveIn({ snapshot, pids: recordedPerl });
		const orphanPerl = descendantsIn({ snapshot, rootPid: controlPid }).filter(
			(proc) => isPerl(proc.name),
		);
		console.log(
			`PLAIN_KILL_LAUNCHER_GONE=${aliveIn({ snapshot, pids: [controlPid] }).length === 0}`,
		);
		console.log(
			`PLAIN_KILL_LEAVES_PERL=${survivingPerl.length > 0 || orphanPerl.length > 0}`,
		);
	} finally {
		// Never fail the probe on this measurement; clean up only recorded descendants.
		try {
			const survivors = aliveIn({
				snapshot: listProcesses(),
				pids: [...recorded.keys()],
			});
			for (const pid of survivors) {
				execFileSync("taskkill", ["/pid", String(pid), "/F"], {
					windowsHide: true,
				});
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
}

async function main(): Promise<number> {
	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "gsd531-06-windows-tree-kill-"),
	);
	const readPath = path.join(tempDir, "read_sample.jpg");
	const writeTargetName = "write_target.jpg";
	fs.copyFileSync(SAMPLE_JPEG_PATH, readPath);
	fs.copyFileSync(SAMPLE_JPEG_PATH, path.join(tempDir, writeTargetName));

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	try {
		await exiftoolProcess.open();
		const launcherPid = exiftoolProcess.pid;
		if (launcherPid === undefined) {
			fail({ marker: "PROBE_WRONG_ERROR", detail: "open() produced no pid" });
		}
		console.log(`PROBE_LAUNCHER_PID=${launcherPid}`);

		const recordedDescendantPids = await proveInProcessPerl({
			exiftoolProcess,
			launcherPid,
			readPath,
		});
		await proveDeadlineKill({
			exiftoolProcess,
			launcherPid,
			recordedDescendantPids,
			tempDir,
			writeTargetName,
		});
		await proveRespawnAndClose({ exiftoolProcess, launcherPid, readPath });
		await measurePlainKillControl({ readPath });

		console.log("WINDOWS_TREE_KILL_PROOF_OK");
		return 0;
	} catch (error: unknown) {
		if (error instanceof ProbeFailure) {
			console.log(error.message);
			console.log(error.marker);
		} else {
			console.error(error);
			console.log("PROBE_UNEXPECTED_EXCEPTION");
		}
		return 1;
	} finally {
		try {
			await exiftoolProcess.close();
		} catch {
			// already closed -- nothing else to do here.
		}
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch (error: unknown) {
			console.log(`PROBE_TEMP_CLEANUP_FAILED=${String(error)}`);
		}
	}
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(error);
		process.exit(1);
	},
);
