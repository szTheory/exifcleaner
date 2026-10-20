import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	isGoneIn,
	listPosixProcesses,
	pollUntilGone,
} from "../helpers/orphan_processes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EXIFTOOL_PATH = path.resolve(REPO_ROOT, ".resources/nix/bin/exiftool");
const WATCHDOG_CONFIG_PATH = path.resolve(
	REPO_ROOT,
	".resources/nix/exiftool-config/watchdog.config",
);
const NAIVE_CONFIG_PATH = path.resolve(
	REPO_ROOT,
	"tests/integration/helpers/naive_watchdog.config",
);
const READY_FIXTURE = path.resolve(
	REPO_ROOT,
	"tests/e2e/fixtures/no_metadata.jpg",
);
const BATCH_FIXTURE = path.resolve(REPO_ROOT, "tests/e2e/fixtures/sample.jpg");
const ORPHAN_PARENT = path.resolve(
	REPO_ROOT,
	"tests/integration/helpers/orphan_parent.ts",
);
const TMP_MARKER = "_exiftool_tmp";

/**
 * Fails loudly (never skips) on a host without POSIX parent-death semantics. The runner-control
 * skips are forbidden by verify:known-gaps, so the precondition refuses by name.
 */
function assertPosixOrphanHost(): void {
	if (process.platform === "win32") {
		throw new Error(
			"Orphan-watchdog test precondition failed: POSIX parent-death semantics are unavailable on win32",
		);
	}
}

interface InflightSpec {
	mode: "raw";
	binPath: string;
	configPath: string;
	parentPidEnv: "self";
	stdoutFile?: string;
	inflightWrite?: { source: string; dest: string };
	inflightOverwriteDir?: string;
}

interface StartedParent {
	parentPid: number;
	childPid: number;
}

/** Pids still to be killed by afterEach. */
const ownedPids: number[] = [];
/** Every pid the file ever spawned, for the file-scoped D-08 leftovers check. */
const everSpawned: number[] = [];

/**
 * Signals a pid this file spawned. The ps row is re-read first and its args must contain the
 * exiftool path or the orphan_parent helper path, so a recycled pid is never signalled (T-63.1-07).
 */
function killOwned(pid: number): void {
	try {
		const row = listPosixProcesses().find((candidate) => candidate.pid === pid);
		if (row === undefined || row.stat.startsWith("Z")) {
			return;
		}
		if (
			!row.args.includes(EXIFTOOL_PATH) &&
			!row.args.includes("orphan_parent")
		) {
			return;
		}
		process.kill(pid, "SIGKILL");
	} catch {
		// already gone
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function sha256(file: string): string {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function startInflightParent(spec: InflightSpec): Promise<StartedParent> {
	const proc = spawn(
		process.execPath,
		["--import", "tsx", ORPHAN_PARENT, JSON.stringify(spec)],
		{ cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
	);
	if (proc.pid !== undefined) {
		ownedPids.push(proc.pid);
		everSpawned.push(proc.pid);
	}
	let stdout = "";
	let stderr = "";
	proc.stderr.setEncoding("utf8");
	proc.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	proc.stdout.setEncoding("utf8");
	const started = await new Promise<StartedParent>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`orphan parent did not report within 15 s: ${stderr}`));
		}, 15_000);
		proc.stdout.on("data", (chunk: string) => {
			stdout += chunk;
			const line = stdout.split("\n").find((l) => l.startsWith("{"));
			if (line !== undefined) {
				clearTimeout(timer);
				resolve(JSON.parse(line) as StartedParent);
			}
		});
		proc.once("exit", () => {
			clearTimeout(timer);
			reject(new Error(`orphan parent exited early: ${stderr}`));
		});
	});
	ownedPids.push(started.parentPid, started.childPid);
	everSpawned.push(started.parentPid, started.childPid);
	return started;
}

afterEach(() => {
	for (const pid of ownedPids.splice(0)) {
		killOwned(pid);
	}
});

afterAll(async () => {
	// Per-file D-08 check. The suite-wide check is the globalSetup teardown (STAY_OPEN_LEFTOVERS).
	const start = Date.now();
	for (;;) {
		const rows = listPosixProcesses();
		const alive = everSpawned.filter((pid) => !isGoneIn({ rows, pid }));
		if (alive.length === 0) {
			return;
		}
		if (Date.now() - start >= 5000) {
			throw new Error(`orphan test leftovers still alive: ${alive.join(",")}`);
		}
		await sleep(100);
	}
}, 15_000);

const RM_OPTIONS = {
	recursive: true,
	force: true,
	maxRetries: 3,
	retryDelay: 100,
} as const;

interface InflightLegResult {
	goneDuringHold: { gone: boolean; elapsedMs: number };
	afterClose: { gone: boolean; elapsedMs: number };
	log: string;
	before: ReturnType<typeof snapshotDir>;
	after: ReturnType<typeof snapshotDir>;
	writeError: string;
}

/**
 * Copy-mode write whose source is a FIFO held open by the test, so the command is in flight in
 * ExifTool's processing code (not in ReadStayOpen) when the parent is SIGKILLed. The child's
 * stdout goes to a file, not a pipe, so a dead-parent SIGPIPE cannot end it (mechanic b).
 */
async function runInflightLeg(configPath: string): Promise<InflightLegResult> {
	const ioDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-inflight-io-"));
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-inflight-out-"));
	const fifo = path.join(ioDir, "in.jpg");
	const log = path.join(ioDir, "child.log");
	const dest = path.join(outDir, "clean.jpg");
	let writer: number | undefined;
	try {
		execFileSync("mkfifo", [fifo]);
		// The writer must be attached before the command is sent (mechanic a).
		const reader = fs.openSync(
			fifo,
			fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
		);
		writer = fs.openSync(fifo, fs.constants.O_WRONLY);
		fs.closeSync(reader);

		const before = snapshotDir(outDir);
		const { parentPid, childPid } = await startInflightParent({
			mode: "raw",
			binPath: EXIFTOOL_PATH,
			configPath,
			parentPidEnv: "self",
			stdoutFile: log,
			inflightWrite: { source: fifo, dest },
		});
		await sleep(300);
		killOwned(parentPid);
		const goneDuringHold = await pollUntilGone({
			pid: childPid,
			timeoutMs: 2500,
			intervalMs: 100,
		});

		let writeError = "none";
		try {
			fs.writeSync(writer, fs.readFileSync(READY_FIXTURE));
		} catch (error) {
			writeError = (error as NodeJS.ErrnoException).code ?? "unknown";
		}
		fs.closeSync(writer);
		writer = undefined;

		const afterClose = await pollUntilGone({
			pid: childPid,
			timeoutMs: 5000,
			intervalMs: 100,
		});
		return {
			goneDuringHold,
			afterClose,
			log: fs.readFileSync(log, "utf8"),
			before,
			after: snapshotDir(outDir),
			writeError,
		};
	} finally {
		if (writer !== undefined) {
			fs.closeSync(writer);
		}
		fs.rmSync(ioDir, RM_OPTIONS);
		fs.rmSync(outDir, RM_OPTIONS);
	}
}

interface BatchCalibration {
	n: number;
	refHash: string;
	origHash: string;
}

let calibration: BatchCalibration | undefined;

const CALIBRATION_FILES = 500;
const MIN_BATCH_FILES = 5000;

interface CalibrationRound {
	copyMs: number;
	execMs: number;
	hashMs: number;
	rmMs: number;
}

/** Times the copy, exiftool, hash and remove phases over a small batch of regular-file copies. */
function calibrationRound(): CalibrationRound {
	const calDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-batch-cal-"));
	try {
		const files = Array.from({ length: CALIBRATION_FILES }, (_, i) =>
			path.join(calDir, `c${i}.jpg`),
		);
		const t0 = Date.now();
		for (const file of files) {
			fs.copyFileSync(BATCH_FIXTURE, file);
		}
		const copyMs = Date.now() - t0;
		const t1 = Date.now();
		execFileSync(EXIFTOOL_PATH, ["-q", "-all=", "-overwrite_original", calDir]);
		const execMs = Date.now() - t1;
		const t2 = Date.now();
		for (const file of files) {
			sha256(file);
		}
		const hashMs = Date.now() - t2;
		const t3 = Date.now();
		fs.rmSync(calDir, RM_OPTIONS);
		return { copyMs, execMs, hashMs, rmMs: Date.now() - t3 };
	} finally {
		fs.rmSync(calDir, RM_OPTIONS);
	}
}

beforeAll(() => {
	assertPosixOrphanHost();
	const t0 = Date.now();
	// Two rounds, per-phase minimum: a single noisy round (cold cache, a busy host) would
	// under-size the batch and let it finish before the 1200 ms in-flight threshold.
	const rounds = [calibrationRound(), calibrationRound()];
	const copyMs = Math.min(...rounds.map((r) => r.copyMs));
	const execMs = Math.min(...rounds.map((r) => r.execMs));
	const hashMs = Math.min(...rounds.map((r) => r.hashMs));
	const rmMs = Math.min(...rounds.map((r) => r.rmMs));
	const perFileExecMs = Math.max(execMs, 1) / CALIBRATION_FILES;
	const perFileLegMs =
		(copyMs + execMs + 2 * hashMs + rmMs) / CALIBRATION_FILES;
	// The floor keeps the batch in flight for the 1200 ms threshold even when calibration
	// over-estimates the per-file cost; a slow host only pays extra wall-clock.
	const n = Math.max(
		MIN_BATCH_FILES,
		Math.min(Math.ceil(3000 / perFileExecMs), Math.floor(4500 / perFileLegMs)),
	);
	const refDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-batch-ref-"));
	try {
		const ref = path.join(refDir, "ref.jpg");
		execFileSync(EXIFTOOL_PATH, ["-q", "-all=", "-o", ref, BATCH_FIXTURE]);
		calibration = {
			n,
			refHash: sha256(ref),
			origHash: sha256(BATCH_FIXTURE),
		};
	} finally {
		fs.rmSync(refDir, RM_OPTIONS);
	}
	console.log(`BATCH_CALIBRATION_MS=${Date.now() - t0}`);
	console.log(`BATCH_N=${n}`);
}, 60_000);

interface BatchLegResult {
	n: number;
	cleaned: number;
	original: number;
	other: number;
	tmp: number;
	goneAfterKillMs: number;
}

/**
 * Overwrite-mode batch under production stdio (all three streams are pipes to the parent), with
 * the parent SIGKILLed 300 ms after the command is sent.
 */
async function runOverwriteBatchLeg(
	configPath: string,
): Promise<BatchLegResult> {
	if (calibration === undefined) {
		throw new Error("batch calibration did not run");
	}
	const { n, refHash, origHash } = calibration;
	const legStart = Date.now();
	const batchDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-batch-"));
	try {
		for (let i = 0; i < n; i++) {
			fs.copyFileSync(BATCH_FIXTURE, path.join(batchDir, `f${i}.jpg`));
		}
		const before = snapshotDir(batchDir);
		const { parentPid, childPid } = await startInflightParent({
			mode: "raw",
			binPath: EXIFTOOL_PATH,
			configPath,
			parentPidEnv: "self",
			inflightOverwriteDir: batchDir,
		});
		await sleep(300);
		const killAt = Date.now();
		killOwned(parentPid);
		const { gone, elapsedMs } = await pollUntilGone({
			pid: childPid,
			timeoutMs: 15_000,
			intervalMs: 100,
		});
		const goneAfterKillMs = Date.now() - killAt;
		expect(gone, `batch child gone after ${elapsedMs} ms`).toBe(true);

		const after = snapshotDir(batchDir);
		let cleaned = 0;
		let original = 0;
		let other = 0;
		let tmp = 0;
		const notOriginal: string[] = [];
		for (const [name, entry] of after) {
			if (name.includes(TMP_MARKER)) {
				tmp++;
			}
			if (entry.digest === refHash) {
				cleaned++;
			} else if (entry.digest === origHash) {
				original++;
			} else {
				other++;
			}
			if (entry.digest !== origHash) {
				notOriginal.push(name);
			}
		}
		const result: BatchLegResult = {
			n,
			cleaned,
			original,
			other,
			tmp,
			goneAfterKillMs,
		};
		if (tmp === 0) {
			assertDirEffect(before, after, {
				added: [],
				removed: [],
				modified: notOriginal,
			});
		}
		return result;
	} finally {
		fs.rmSync(batchDir, RM_OPTIONS);
		console.log(`BATCH_LEG_TOTAL_MS=${Date.now() - legStart}`);
	}
}

describe("ExifTool orphan watchdog never interrupts a write (LIF-01)", () => {
	it("an in-flight write completes after the parent is SIGKILLed and the child exits only afterwards (LIF-01, D-01)", async () => {
		assertPosixOrphanHost();
		const leg = await runInflightLeg(WATCHDOG_CONFIG_PATH);
		expect(leg.goneDuringHold.gone).toBe(false);
		expect(leg.afterClose.gone).toBe(true);
		console.log(`INFLIGHT_COMPLETED_EXIT_MS=${leg.afterClose.elapsedMs}`);
		expect(leg.log).toContain("1 image files created");
		expect(leg.log.split("{ready}").length - 1).toBe(2);
		assertDirEffect(leg.before, leg.after, { added: ["clean.jpg"] });
	}, 60_000);

	it("a naive SIGALRM watchdog truncates the same in-flight write (negative control)", async () => {
		assertPosixOrphanHost();
		const leg = await runInflightLeg(NAIVE_CONFIG_PATH);
		console.log(`INFLIGHT_NAIVE_GONE_MS=${leg.goneDuringHold.elapsedMs}`);
		console.log(`INFLIGHT_NAIVE_WRITE_ERROR=${leg.writeError}`);
		expect(leg.goneDuringHold.gone).toBe(true);
		expect(leg.log.split("{ready}").length - 1).toBe(1);
		expect(leg.log).not.toContain("image files created");
		assertDirEffect(leg.before, leg.after, { added: [] });
	}, 60_000);

	it("an overwrite batch in flight under production stdio completes and no source is left partial (LIF-01, D-01)", async () => {
		assertPosixOrphanHost();
		const leg = await runOverwriteBatchLeg(WATCHDOG_CONFIG_PATH);
		console.log(`BATCH_COMPLETED_MS=${leg.goneAfterKillMs}`);
		// Logged before asserting so a red CI run shows every value, not only the first failure.
		console.log(`BATCH_LEG_RESULT=${JSON.stringify(leg)}`);
		expect(leg.cleaned).toBe(leg.n);
		expect(leg.original).toBe(0);
		expect(leg.other).toBe(0);
		expect(leg.tmp).toBe(0);
		expect(leg.goneAfterKillMs).toBeGreaterThanOrEqual(1200);
	}, 90_000);

	it("a naive watchdog interrupts the same batch but every file is original or fully cleaned (negative control)", async () => {
		assertPosixOrphanHost();
		const leg = await runOverwriteBatchLeg(NAIVE_CONFIG_PATH);
		console.log(`BATCH_NAIVE_SPLIT=${leg.cleaned}/${leg.original}`);
		expect(leg.original).toBeGreaterThanOrEqual(1);
		expect(leg.other).toBe(0);
		expect(leg.tmp).toBe(0);
		expect(leg.cleaned + leg.original).toBe(leg.n);
	}, 90_000);
});
