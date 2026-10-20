import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
const READY_FIXTURE = path.resolve(
	REPO_ROOT,
	"tests/e2e/fixtures/no_metadata.jpg",
);
const ORPHAN_PARENT = path.resolve(
	REPO_ROOT,
	"tests/integration/helpers/orphan_parent.ts",
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

interface ParentSpec {
	mode: "class" | "raw";
	binPath: string;
	configPath?: string;
	readyFile?: string;
	parentPidEnv?: string;
	dieBeforeReady?: boolean;
}

interface StartedParent {
	parentPid: number;
	childPid: number;
}

const ownedPids: number[] = [];

async function startParent(spec: ParentSpec): Promise<StartedParent> {
	const proc = spawn(
		process.execPath,
		["--import", "tsx", ORPHAN_PARENT, JSON.stringify(spec)],
		{ cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
	);
	if (proc.pid !== undefined) {
		ownedPids.push(proc.pid);
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
	return started;
}

afterEach(() => {
	const rows = listPosixProcesses();
	for (const pid of ownedPids.splice(0)) {
		if (isGoneIn({ rows, pid })) {
			continue;
		}
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// already gone
		}
	}
});

describe("ExifTool orphan watchdog (LIF-01)", () => {
	it("the production ExiftoolProcess child exits within 5 s after its parent is SIGKILLed (D-01, D-08)", async () => {
		assertPosixOrphanHost();
		const { parentPid, childPid } = await startParent({
			mode: "class",
			binPath: EXIFTOOL_PATH,
			configPath: WATCHDOG_CONFIG_PATH,
			readyFile: READY_FIXTURE,
		});

		const childRow = listPosixProcesses().find((row) => row.pid === childPid);
		expect(childRow?.ppid).toBe(parentPid);

		await new Promise<void>((resolve) => setTimeout(resolve, 2200));
		expect(isGoneIn({ rows: listPosixProcesses(), pid: childPid })).toBe(false);

		process.kill(parentPid, "SIGKILL");
		const { gone, elapsedMs } = await pollUntilGone({
			pid: childPid,
			timeoutMs: 5000,
			intervalMs: 100,
		});
		console.log(`ORPHAN_EXIT_MS=${elapsedMs}`);
		expect(gone).toBe(true);
	}, 30_000);
});
