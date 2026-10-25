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
// LIF-01 / D-10 / D-12 (Phase 63.1): the final section, proveJobObjectOrphanKill, executes the
// Windows half of the orphaned-ExifTool protection. A node parent spawns exiftool.exe attached
// (detached:false) with `-stay_open True -@ <empty argfile>`; `taskkill /PID <parent> /F` WITHOUT
// /T must still end the child within 5 s (libuv puts non-detached children in a kill-on-close job
// object), else PROBE_ORPHAN_SURVIVED. The same with detached:true is the control: libuv skips job
// assignment for detached children (process.c 1117-1129), so the child must still be alive at 2 s,
// else PROBE_CONTROL_VACUOUS. Execution is required because libuv swallows ERROR_ACCESS_DENIED
// from AssignProcessToJobObject (1147-1167): a source trace cannot show the assignment held.
// Asymmetry (D-12): on Windows a force-quit ends ExifTool immediately, even mid-write, because the
// job object uses TerminateProcess; POSIX exits only when idle. Pair 3 executes the Windows half of
// "the source is preserved either way": it job-kills a parent while a calibrated
// `-all= -overwrite_original` batch is in flight and requires every file to be byte-identical to
// the original or the fully cleaned reference (at least one of each), with at most one
// `_exiftool_tmp` leftover whose source is untouched (PROBE_SOURCE_PARTIAL, PROBE_TMP_LEFTOVERS,
// PROBE_MIDWRITE_VACUOUS). taskkill only ever targets pids this probe recorded.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	ExifToolCommandTimeoutError,
	ExiftoolProcess,
} from "../../src/infrastructure/exiftool/ExiftoolProcess";
import {
	isPidAliveWin32,
	pollUntilGoneWin32,
} from "../helpers/orphan_processes";

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

interface OrphanParent {
	readonly proc: ChildProcess;
	readonly parentPid: number;
	readonly childPid: number;
}

// The tiny parent is a node script run from a file (not -e), so Windows command-line quoting
// never touches the paths. It spawns ExifTool, prints one JSON pid line, and idles. Killing it
// with taskkill /F (TerminateProcess, no /T) leaves ExifTool's fate to the job object alone.
function writeParentScript({
	scriptPath,
	exiftoolArgs,
	detached,
	logPath,
	stdinPipe,
}: {
	scriptPath: string;
	exiftoolArgs: string[];
	detached: boolean;
	logPath: string | undefined;
	stdinPipe: boolean;
}): void {
	const source = [
		'const { spawn } = require("node:child_process");',
		'const fs = require("node:fs");',
		`const logPath = ${JSON.stringify(logPath ?? null)};`,
		'const fd = logPath === null ? "ignore" : fs.openSync(logPath, "w");',
		`const stdio = [${JSON.stringify(stdinPipe ? "pipe" : "ignore")}, fd, fd];`,
		`const child = spawn(${JSON.stringify(EXIFTOOL_PATH)}, ${JSON.stringify(exiftoolArgs)}, { windowsHide: true, stdio, detached: ${String(detached)} });`,
		detached ? "child.unref();" : "",
		'process.stdout.write(JSON.stringify({ parentPid: process.pid, childPid: child.pid }) + "\\n");',
		"setInterval(() => {}, 2147483647);",
		"",
	].join("\n");
	fs.writeFileSync(scriptPath, source);
}

async function startOrphanParent({
	tempDir,
	label,
	exiftoolArgs,
	detached,
	logPath,
	stdinPipe,
}: {
	tempDir: string;
	label: string;
	exiftoolArgs: string[];
	detached: boolean;
	logPath?: string | undefined;
	stdinPipe?: boolean | undefined;
}): Promise<OrphanParent> {
	const scriptPath = path.join(tempDir, `orphan_parent_${label}.cjs`);
	writeParentScript({
		scriptPath,
		exiftoolArgs,
		detached,
		logPath,
		stdinPipe: stdinPipe ?? false,
	});
	const proc = spawn(process.execPath, [scriptPath], {
		windowsHide: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	proc.stderr?.resume();
	const pids = await new Promise<{ parentPid: number; childPid: number }>(
		(resolve, reject) => {
			let buffer = "";
			const timer = setTimeout(
				() => reject(new Error(`${label}: parent reported no pids in 10 s`)),
				10_000,
			);
			proc.stdout?.on("data", (chunk: Buffer) => {
				buffer += chunk.toString("utf8");
				const newline = buffer.indexOf("\n");
				if (newline < 0) {
					return;
				}
				clearTimeout(timer);
				try {
					const parsed = JSON.parse(buffer.slice(0, newline)) as {
						parentPid?: unknown;
						childPid?: unknown;
					};
					if (
						typeof parsed.parentPid !== "number" ||
						typeof parsed.childPid !== "number"
					) {
						reject(new Error(`${label}: bad pid line ${buffer}`));
						return;
					}
					resolve({ parentPid: parsed.parentPid, childPid: parsed.childPid });
				} catch (error: unknown) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			});
			proc.once("exit", (code) => {
				clearTimeout(timer);
				reject(new Error(`${label}: parent exited early (code ${code})`));
			});
		},
	).catch((error: unknown) =>
		fail({ marker: "PROBE_PARENT_START_FAILED", detail: String(error) }),
	);
	return { proc, ...pids };
}

// Confirms the pair is real before the kill: the child row exists as exiftool.exe, the parent
// row exists, and no perl.exe hangs under the child (in-process Perl premise).
function assertPairObserved({
	pair,
	label,
}: {
	pair: OrphanParent;
	label: string;
}): void {
	const snapshot = listProcesses();
	const childRow = snapshot.find((proc) => proc.pid === pair.childPid);
	if (childRow === undefined || !isLauncher(childRow.name)) {
		fail({
			marker: "PROBE_CHILD_NOT_OBSERVED",
			detail: `${label}: child ${pair.childPid} row ${JSON.stringify(childRow)}`,
		});
	}
	if (!snapshot.some((proc) => proc.pid === pair.parentPid)) {
		fail({
			marker: "PROBE_CHILD_NOT_OBSERVED",
			detail: `${label}: parent ${pair.parentPid} missing`,
		});
	}
	const perl = descendantsIn({ snapshot, rootPid: pair.childPid }).filter(
		(proc) => isPerl(proc.name),
	);
	if (perl.length > 0) {
		fail({
			marker: "PROBE_UNEXPECTED_PERL_CHILD",
			detail: JSON.stringify(perl),
		});
	}
}

// Kill the recorded parent only. Never /T: the child must be ended by the job object or not at all.
function killParentWithoutTree(parentPid: number): void {
	execFileSync("taskkill", ["/PID", String(parentPid), "/F"], {
		windowsHide: true,
	});
}

// A live pid is an orphan only if the process table still names it exiftool.exe (pid reuse guard).
function isStillExiftool(childPid: number): boolean {
	const row = listProcesses().find((proc) => proc.pid === childPid);
	return row !== undefined && isLauncher(row.name);
}

function sha256File(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function expectJobKillsChild({
	pair,
	label,
}: {
	pair: OrphanParent;
	label: string;
}): Promise<number> {
	const { gone, elapsedMs } = await pollUntilGoneWin32({
		pid: pair.childPid,
		timeoutMs: 5000,
		intervalMs: 100,
	});
	if (!gone && isStillExiftool(pair.childPid)) {
		fail({
			marker: "PROBE_ORPHAN_SURVIVED",
			detail: `${label}: child ${pair.childPid} alive ${elapsedMs} ms after the parent was killed`,
		});
	}
	return elapsedMs;
}

// D-10 / D-12 / LIF-01 -- see the header paragraph. Pair 1 is the proof, pair 2 the control,
// pair 3 the Windows half of "the source is preserved either way".
async function proveJobObjectOrphanKill({
	tempDir,
}: {
	tempDir: string;
}): Promise<void> {
	const recorded = new Set<number>();
	const remember = (pair: OrphanParent): void => {
		recorded.add(pair.parentPid);
		recorded.add(pair.childPid);
	};
	try {
		// An empty argfile: at EOF ExifTool re-polls forever, so it cannot exit through a stdin
		// pipe and the job object is the only possible cause of the child's death.
		const emptyArgfile = path.join(tempDir, "orphan_argfile.txt");
		fs.writeFileSync(emptyArgfile, "");
		const stayOpenArgs = ["-stay_open", "True", "-@", emptyArgfile];

		// Pair 1: attached child, parent killed without /T, job object must end the child.
		const attached = await startOrphanParent({
			tempDir,
			label: "attached",
			exiftoolArgs: stayOpenArgs,
			detached: false,
		});
		remember(attached);
		assertPairObserved({ pair: attached, label: "attached" });
		killParentWithoutTree(attached.parentPid);
		const killMs = await expectJobKillsChild({
			pair: attached,
			label: "attached",
		});
		console.log(`PROBE_JOB_KILL_MS=${killMs}`);

		// Pair 2: detached child (libuv skips job assignment) must outlive the same kill.
		const detached = await startOrphanParent({
			tempDir,
			label: "detached",
			exiftoolArgs: stayOpenArgs,
			detached: true,
		});
		remember(detached);
		assertPairObserved({ pair: detached, label: "detached" });
		killParentWithoutTree(detached.parentPid);
		await sleep(2000);
		if (
			!isPidAliveWin32(detached.childPid) ||
			!isStillExiftool(detached.childPid)
		) {
			fail({
				marker: "PROBE_CONTROL_VACUOUS",
				detail: `detached child ${detached.childPid} did not survive the parent kill`,
			});
		}
		console.log("PROBE_DETACHED_ALIVE_AT_2S=true");
		killRecordedPids([detached.childPid]);

		// Measured only: does a detached child with a stdin pipe exit when the parent dies?
		try {
			const piped = await startOrphanParent({
				tempDir,
				label: "piped",
				exiftoolArgs: ["-stay_open", "True", "-@", "-"],
				detached: true,
				stdinPipe: true,
			});
			remember(piped);
			killParentWithoutTree(piped.parentPid);
			await sleep(2000);
			console.log(
				`PIPE_EOF_EXITS=${!(isPidAliveWin32(piped.childPid) && isStillExiftool(piped.childPid))}`,
			);
			killRecordedPids([piped.childPid]);
		} catch (error: unknown) {
			if (
				error instanceof ProbeFailure &&
				error.marker !== "PROBE_PARENT_START_FAILED"
			) {
				throw error;
			}
			console.log("PIPE_EOF_EXITS=unmeasured");
		}

		await proveMidWriteSourcePreserved({ tempDir, remember });
	} finally {
		killRecordedPids([...recorded]);
	}
}

// Best-effort cleanup of pids this probe recorded. Re-checks the name first so a reused pid is
// never touched.
function killRecordedPids(pids: number[]): void {
	try {
		const snapshot = listProcesses();
		for (const pid of pids) {
			const row = snapshot.find((proc) => proc.pid === pid);
			if (
				row === undefined ||
				!(isLauncher(row.name) || row.name.toLowerCase() === "node.exe")
			) {
				continue;
			}
			try {
				execFileSync("taskkill", ["/PID", String(pid), "/F"], {
					windowsHide: true,
				});
			} catch {
				// already gone
			}
		}
	} catch {
		// best-effort cleanup only
	}
}

async function proveMidWriteSourcePreserved({
	tempDir,
	remember,
}: {
	tempDir: string;
	remember: (pair: OrphanParent) => void;
}): Promise<void> {
	const pair3Start = Date.now();

	// Calibrate every phase so the batch is about 3 s of ExifTool work and the per-file phases
	// stay within about 5 s on any host speed.
	const calDir = path.join(tempDir, "cal");
	fs.mkdirSync(calDir);
	const copyStart = Date.now();
	for (let i = 0; i < 100; i++) {
		fs.copyFileSync(SAMPLE_JPEG_PATH, path.join(calDir, `c${i}.jpg`));
	}
	const copyMs = Date.now() - copyStart;
	const verStart = Date.now();
	execFileSync(EXIFTOOL_PATH, ["-ver"], { windowsHide: true });
	const t0 = Date.now() - verStart;
	const cleanStart = Date.now();
	execFileSync(EXIFTOOL_PATH, ["-q", "-all=", "-overwrite_original", calDir], {
		windowsHide: true,
	});
	const t1 = Date.now() - cleanStart;
	const hashStart = Date.now();
	for (const name of fs.readdirSync(calDir)) {
		sha256File(path.join(calDir, name));
	}
	const hashMs = Date.now() - hashStart;
	const rmStart = Date.now();
	fs.rmSync(calDir, { recursive: true, force: true });
	const rmMs = Date.now() - rmStart;
	const execMs = t1 - t0;
	const perFileExecMs = Math.max(0.05, execMs / 100);
	const perFileLegMs = (copyMs + execMs + hashMs + rmMs) / 100;
	const batchCount = Math.min(
		Math.ceil(3000 / perFileExecMs),
		Math.floor(5000 / perFileLegMs),
	);
	console.log(`PROBE_MIDWRITE_N=${batchCount}`);
	console.log(
		`PROBE_MIDWRITE_CALIBRATION=${JSON.stringify({ copyMs, execMs, hashMs, rmMs })}`,
	);
	if (batchCount < 100) {
		fail({
			marker: "PROBE_MIDWRITE_VACUOUS",
			detail: `host too slow to hold a batch in flight within budget (N=${batchCount})`,
		});
	}

	const refPath = path.join(tempDir, "ref.jpg");
	execFileSync(
		EXIFTOOL_PATH,
		["-q", "-all=", "-o", refPath, SAMPLE_JPEG_PATH],
		{
			windowsHide: true,
		},
	);
	const refHash = sha256File(refPath);
	const origHash = sha256File(SAMPLE_JPEG_PATH);
	const batchDir = path.join(tempDir, "batch");
	fs.mkdirSync(batchDir);
	for (let i = 0; i < batchCount; i++) {
		fs.copyFileSync(SAMPLE_JPEG_PATH, path.join(batchDir, `f${i}.jpg`));
	}

	// The in-flight batch: after the second -execute ExifTool re-polls the argfile forever.
	const argfile = path.join(tempDir, "midwrite_argfile.txt");
	fs.writeFileSync(
		argfile,
		["-ver", "-execute", "-all=", "-overwrite_original", batchDir, "-execute"]
			.map((line) => `${line}\n`)
			.join(""),
	);
	const logPath = path.join(tempDir, "midwrite.log");
	const pair = await startOrphanParent({
		tempDir,
		label: "midwrite",
		exiftoolArgs: ["-stay_open", "True", "-@", argfile],
		detached: false,
		logPath,
	});
	remember(pair);
	const readyDeadline = Date.now() + 30_000;
	while (!(
		fs.existsSync(logPath) &&
		fs.readFileSync(logPath, "utf8").includes("{ready}")
	)) {
		if (Date.now() > readyDeadline) {
			fail({
				marker: "PROBE_MIDWRITE_NO_READY",
				detail: "no {ready} in midwrite.log within 30 s",
			});
		}
		await sleep(50);
	}
	await sleep(1000);
	killParentWithoutTree(pair.parentPid);
	await expectJobKillsChild({ pair, label: "midwrite" });

	let cleaned = 0;
	let original = 0;
	let other = 0;
	const tmpNames: string[] = [];
	for (const name of fs.readdirSync(batchDir)) {
		if (name.includes("_exiftool_tmp")) {
			tmpNames.push(name);
			continue;
		}
		const hash = sha256File(path.join(batchDir, name));
		if (hash === refHash) {
			cleaned += 1;
		} else if (hash === origHash) {
			original += 1;
		} else {
			other += 1;
		}
	}
	console.log(
		`PROBE_MIDWRITE_SOURCE=${JSON.stringify({ cleaned, original, other, tmp: tmpNames.length })}`,
	);
	if (other > 0 || cleaned + original !== batchCount) {
		fail({
			marker: "PROBE_SOURCE_PARTIAL",
			detail: JSON.stringify({ cleaned, original, other, batchCount }),
		});
	}
	// D-12 residue: TerminateProcess skips ExifTool's own temp-file cleanup, so the one in-flight
	// file may leave a temporary, but its source must be untouched.
	const tmpProblem =
		tmpNames.length > 1 ||
		tmpNames.some((name) => {
			const source = path.join(batchDir, name.replace("_exiftool_tmp", ""));
			return !fs.existsSync(source) || sha256File(source) !== origHash;
		});
	if (tmpProblem) {
		fail({ marker: "PROBE_TMP_LEFTOVERS", detail: JSON.stringify(tmpNames) });
	}
	if (cleaned === 0 || original === 0) {
		fail({
			marker: "PROBE_MIDWRITE_VACUOUS",
			detail: `the kill did not land mid-batch: ${JSON.stringify({ cleaned, original })}`,
		});
	}
	fs.rmSync(batchDir, { recursive: true, force: true });
	console.log(`PAIR3_TOTAL_MS=${Date.now() - pair3Start}`);
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
		await proveJobObjectOrphanKill({ tempDir });

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
