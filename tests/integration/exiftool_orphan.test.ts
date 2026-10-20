import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import {
	isGoneIn,
	listPosixProcesses,
	pollUntilGone,
	startOrphanParent,
	type OrphanParentSpec,
} from "../helpers/orphan_processes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EXIFTOOL_PATH = path.resolve(REPO_ROOT, ".resources/nix/bin/exiftool");
const WATCHDOG_CONFIG_PATH = path.resolve(
	REPO_ROOT,
	".resources/nix/exiftool-config/watchdog.config",
);
const READY_FIXTURE = path.resolve(
	REPO_ROOT,
	"tests/e2e/fixtures/no_metadata.jpg",
);

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

function rowOf(pid: number) {
	return listPosixProcesses().find((row) => row.pid === pid);
}

async function startTracked(
	spec: OrphanParentSpec,
): Promise<{ parentPid: number; childPid: number }> {
	const before = ownedPids.length;
	const started = await startOrphanParent({
		spec,
		repoRoot: REPO_ROOT,
		owned: ownedPids,
	});
	everSpawned.push(...ownedPids.slice(before));
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

describe("ExifTool orphan watchdog (LIF-01)", () => {
	it("the production ExiftoolProcess child exits within 5 s after its parent is SIGKILLed (D-01, D-08)", async () => {
		assertPosixOrphanHost();
		const { parentPid, childPid } = await startTracked({
			mode: "class",
			binPath: EXIFTOOL_PATH,
			configPath: WATCHDOG_CONFIG_PATH,
			readyFile: READY_FIXTURE,
		});

		const childRow = listPosixProcesses().find((row) => row.pid === childPid);
		expect(childRow?.ppid).toBe(parentPid);

		await new Promise<void>((resolve) => setTimeout(resolve, 2200));
		expect(isGoneIn({ rows: listPosixProcesses(), pid: childPid })).toBe(false);

		killOwned(parentPid);
		const { gone, elapsedMs } = await pollUntilGone({
			pid: childPid,
			timeoutMs: 5000,
			intervalMs: 100,
		});
		console.log(`ORPHAN_EXIT_MS=${elapsedMs}`);
		expect(gone).toBe(true);
	}, 30_000);

	it("without -config the orphaned child keeps running (negative control, D-08)", async () => {
		assertPosixOrphanHost();
		const { parentPid, childPid } = await startTracked({
			mode: "class",
			binPath: EXIFTOOL_PATH,
			readyFile: READY_FIXTURE,
		});
		killOwned(parentPid);
		await sleep(2000);
		const row = rowOf(childPid);
		expect(row).toBeDefined();
		expect(row?.stat.startsWith("Z")).toBe(false);
		expect(row?.ppid).not.toBe(parentPid);
		console.log(`NEGATIVE_CONTROL_ALIVE_PPID=${row?.ppid}`);
	}, 30_000);

	it("an expected pid that is not the real parent makes the idle child exit while the parent lives (D-02)", async () => {
		assertPosixOrphanHost();
		const { parentPid, childPid } = await startTracked({
			mode: "raw",
			binPath: EXIFTOOL_PATH,
			configPath: WATCHDOG_CONFIG_PATH,
			parentPidEnv: String(process.pid),
		});
		const { gone, elapsedMs } = await pollUntilGone({
			pid: childPid,
			timeoutMs: 5000,
			intervalMs: 100,
		});
		console.log(`WRONG_PID_EXIT_MS=${elapsedMs}`);
		expect(gone).toBe(true);
		expect(isGoneIn({ rows: listPosixProcesses(), pid: parentPid })).toBe(
			false,
		);
	}, 30_000);

	it("the child still exits when its parent dies before ExifTool loads the config (D-02 gap)", async () => {
		assertPosixOrphanHost();
		const { childPid } = await startTracked({
			mode: "raw",
			binPath: EXIFTOOL_PATH,
			configPath: WATCHDOG_CONFIG_PATH,
			parentPidEnv: "self",
			dieBeforeReady: true,
		});
		const { gone, elapsedMs } = await pollUntilGone({
			pid: childPid,
			timeoutMs: 5000,
			intervalMs: 100,
		});
		console.log(`EARLY_DEATH_EXIT_MS=${elapsedMs}`);
		expect(gone).toBe(true);
	}, 30_000);

	it("without -config the early-death child keeps running (negative control for the D-02 gap)", async () => {
		assertPosixOrphanHost();
		const { parentPid, childPid } = await startTracked({
			mode: "raw",
			binPath: EXIFTOOL_PATH,
			parentPidEnv: "self",
			dieBeforeReady: true,
		});
		await sleep(2200);
		const row = rowOf(childPid);
		expect(row).toBeDefined();
		expect(row?.stat.startsWith("Z")).toBe(false);
		expect(row?.ppid).not.toBe(parentPid);
		console.log(`EARLY_DEATH_CONTROL_ALIVE_PPID=${row?.ppid}`);
	}, 30_000);

	it("a missing or malformed expected pid falls back to getppid() (D-02 fallback)", async () => {
		assertPosixOrphanHost();
		const variants: { label: string; spec: Partial<OrphanParentSpec> }[] = [
			{ label: "unset", spec: {} },
			{ label: "empty", spec: { parentPidEnv: "" } },
			{ label: "abc", spec: { parentPidEnv: "abc" } },
			{ label: "zero", spec: { parentPidEnv: "0" } },
			{ label: "negative", spec: { parentPidEnv: "-5" } },
		];
		const started = await Promise.all(
			variants.map(async ({ label, spec }) => ({
				label,
				...(await startTracked({
					mode: "raw",
					binPath: EXIFTOOL_PATH,
					configPath: WATCHDOG_CONFIG_PATH,
					...spec,
				})),
			})),
		);
		await sleep(2200);
		const rows = listPosixProcesses();
		for (const { label, childPid } of started) {
			expect(isGoneIn({ rows, pid: childPid }), `${label} child alive`).toBe(
				false,
			);
		}
		for (const { parentPid } of started) {
			killOwned(parentPid);
		}
		const results = await Promise.all(
			started.map(async ({ label, childPid }) => ({
				label,
				...(await pollUntilGone({
					pid: childPid,
					timeoutMs: 5000,
					intervalMs: 100,
				})),
			})),
		);
		for (const { label, gone, elapsedMs } of results) {
			console.log(`FALLBACK_EXIT_MS[${label}]=${elapsedMs}`);
			expect(gone, `${label} child gone`).toBe(true);
		}
	}, 30_000);

	it.each([
		{
			label: "missing file",
			configPath: path.resolve(
				REPO_ROOT,
				".resources/nix/exiftool-config/missing.config",
			),
			expectWarning: true,
		},
		{ label: "empty file", configPath: "/dev/null", expectWarning: false },
		{
			label: "directory",
			configPath: path.resolve(REPO_ROOT, ".resources/nix/exiftool-config"),
			expectWarning: false,
		},
	])(
		"a $label config still serves commands (D-05)",
		async ({ configPath, expectWarning }) => {
			assertPosixOrphanHost();
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const exiftool = new ExiftoolProcess({
					binPath: EXIFTOOL_PATH,
					configPath,
				});
				const pid = await exiftool.open();
				ownedPids.push(pid);
				everSpawned.push(pid);
				const result = await exiftool.readMetadata({
					filePath: READY_FIXTURE,
					args: [],
				});
				expect(result.data?.[0] ?? {}).not.toEqual({});
				if (expectWarning) {
					const collect = () =>
						warn.mock.calls.map((call) => call.join(" ")).join("\n");
					const start = Date.now();
					while (
						!collect().includes("Config file not found") &&
						Date.now() - start < 5000
					) {
						await sleep(50);
					}
					expect(collect()).toContain("Config file not found");
				}
				await exiftool.close();
			} finally {
				warn.mockRestore();
			}
		},
		30_000,
	);

	it("-config is argv index 0 in the live child for both open() and respawn() (D-04)", async () => {
		assertPosixOrphanHost();
		const suffix = `${EXIFTOOL_PATH} -config ${WATCHDOG_CONFIG_PATH} -stay_open True -@ -`;
		const exiftool = new ExiftoolProcess({
			binPath: EXIFTOOL_PATH,
			configPath: WATCHDOG_CONFIG_PATH,
		});
		const firstPid = await exiftool.open();
		ownedPids.push(firstPid);
		everSpawned.push(firstPid);
		await exiftool.readMetadata({ filePath: READY_FIXTURE, args: [] });
		expect(rowOf(firstPid)?.args.endsWith(suffix)).toBe(true);

		killOwned(firstPid);
		const start = Date.now();
		let secondPid = exiftool.pid;
		while (
			(secondPid === undefined || secondPid === firstPid) &&
			Date.now() - start < 5000
		) {
			await sleep(50);
			secondPid = exiftool.pid;
		}
		expect(secondPid).toBeDefined();
		expect(secondPid).not.toBe(firstPid);
		if (secondPid !== undefined) {
			ownedPids.push(secondPid);
			everSpawned.push(secondPid);
			expect(rowOf(secondPid)?.args.endsWith(suffix)).toBe(true);
		}
		const again = await exiftool.readMetadata({
			filePath: READY_FIXTURE,
			args: [],
		});
		expect(again.data?.[0] ?? {}).not.toEqual({});
		await exiftool.close();
	}, 30_000);

	it("the bundled ExifTool still defines ReadStayOpen and the watchdog still matches it (D-08 drift)", () => {
		const bundled = fs.readFileSync(EXIFTOOL_PATH, "utf8");
		const watchdog = fs.readFileSync(WATCHDOG_CONFIG_PATH, "utf8");
		expect(bundled).toContain("sub ReadStayOpen");
		expect(watchdog).toContain("main::ReadStayOpen");
	});
});
