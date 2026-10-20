import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	classifyStayOpenLeftovers,
	isGoneIn,
	listPosixProcesses,
	type ProcessRow,
} from "../helpers/orphan_processes";

// LIF-01 / D-08: after every vitest file has finished, no exiftool -stay_open child this run
// created may still be running. A live deliberate orphan proves the check can fail.
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const EXIFTOOL_PATH = path.join(REPO_ROOT, ".resources/nix/bin/exiftool");
const ORPHAN_PARENT = path.join(
	REPO_ROOT,
	"tests/integration/helpers/orphan_parent.ts",
);
const scopeRoots = [REPO_ROOT, fs.realpathSync(os.tmpdir()), os.tmpdir()];

let preexisting: ReadonlySet<number> = new Set();

function inScopeStayOpenPids(rows: ProcessRow[]): Set<number> {
	return new Set(
		classifyStayOpenLeftovers({
			rows,
			scopeRoots,
			preexisting: new Set(),
			runnerPid: process.pid,
			// Every in-scope -stay_open row counts for the snapshot, whatever its parent.
			reaperPids: new Set(rows.map((r) => r.ppid)),
		}).map((r) => r.pid),
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setup(): void {
	if (process.platform === "win32") {
		return;
	}
	preexisting = inScopeStayOpenPids(listPosixProcesses());
}

async function spawnOrphanControl(): Promise<{
	parentPid: number;
	childPid: number;
}> {
	const parent = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			ORPHAN_PARENT,
			JSON.stringify({ mode: "raw", binPath: EXIFTOOL_PATH }),
		],
		{ cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
	);
	parent.stderr.resume();
	const pids = await new Promise<{ parentPid: number; childPid: number }>(
		(resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(new Error("D-08 gate control parent printed no pid in 15 s")),
				15_000,
			);
			let seen = "";
			parent.stdout.setEncoding("utf8");
			parent.stdout.on("data", (chunk: string) => {
				seen += chunk;
				const line = seen.split("\n").find((l) => l.startsWith("{"));
				if (line !== undefined) {
					clearTimeout(timer);
					resolve(JSON.parse(line) as { parentPid: number; childPid: number });
				}
			});
			parent.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
		},
	);
	process.kill(pids.parentPid, "SIGKILL");
	parent.unref();
	parent.stdout.destroy();
	parent.stderr.destroy();
	return pids;
}

export async function teardown(): Promise<void> {
	if (process.platform === "win32") {
		console.log("STAY_OPEN_LEFTOVERS=unsupported-platform");
		return;
	}
	const started = Date.now();

	// 1. Live control: a deliberate orphan must be detected, or the gate is vacuous.
	const { parentPid, childPid } = await spawnOrphanControl();
	let observedReaper = parentPid;
	const controlDeadline = Date.now() + 5000;
	for (;;) {
		const control = listPosixProcesses().find((r) => r.pid === childPid);
		if (control !== undefined && control.ppid !== parentPid) {
			observedReaper = control.ppid;
			break;
		}
		if (Date.now() >= controlDeadline) {
			break;
		}
		await sleep(100);
	}
	const controlRows = listPosixProcesses();
	const detected = classifyStayOpenLeftovers({
		rows: controlRows,
		scopeRoots,
		preexisting,
		runnerPid: process.pid,
		reaperPids: new Set([1, observedReaper]),
	}).some((r) => r.pid === childPid);
	if (!detected) {
		const control = controlRows.find((r) => r.pid === childPid);
		throw new Error(
			`D-08 leftover gate control failed: a deliberate orphan (pid ${childPid}, ppid ${control?.ppid ?? "gone"}) was not detected`,
		);
	}
	const controlRow = controlRows.find((r) => r.pid === childPid);
	if (controlRow?.args.includes(EXIFTOOL_PATH) === true) {
		process.kill(childPid, "SIGKILL");
	}
	const killDeadline = Date.now() + 5000;
	while (
		!isGoneIn({ rows: listPosixProcesses(), pid: childPid }) &&
		Date.now() < killDeadline
	) {
		await sleep(100);
	}

	// 2. Final check: session closes from the last test files finish asynchronously.
	let leftovers: ProcessRow[] = [];
	const finalDeadline = Date.now() + 5000;
	for (;;) {
		leftovers = classifyStayOpenLeftovers({
			rows: listPosixProcesses(),
			scopeRoots,
			preexisting,
			runnerPid: process.pid,
			reaperPids: new Set([1, observedReaper]),
		});
		if (leftovers.length === 0 || Date.now() >= finalDeadline) {
			break;
		}
		await sleep(100);
	}
	if (leftovers.length > 0) {
		// Reported, never killed: a red run must leave the leak visible.
		const lines = leftovers.map(
			(r) => `${r.pid} ${r.ppid} ${r.stat} ${r.args}`,
		);
		throw new Error(
			`D-08 suite leftover: ${leftovers.length} exiftool -stay_open process(es) from this run are still running:\n${lines.join("\n")}`,
		);
	}
	console.log(
		`STAY_OPEN_LEFTOVERS=0 CONTROL_DETECTED=true CONTROL_REAPER=${observedReaper} LEFTOVER_GATE_MS=${Date.now() - started}`,
	);
}
