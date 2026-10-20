import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exiftoolSpawnArgs } from "../../src/infrastructure/exiftool/exiftool_spawn_args";
import {
	listPosixProcesses,
	listWindowsProcesses,
	pollUntilGone,
	pollUntilGoneWin32,
	startOrphanParent,
} from "../helpers/orphan_processes";
import {
	assertInstalledPayloadUnchanged,
	launchPackagedApp,
	packagedResourcesPath,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const REPO_CONFIG = path.resolve(
	REPO_ROOT,
	".resources/nix/exiftool-config/watchdog.config",
);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface ChildRow {
	pid: number;
	/** POSIX args or the win32 command line. */
	text: string;
	/** win32 image name, empty on POSIX. */
	name: string;
}

/** Every process whose parent is `appPid`, from the platform's process table. */
function childrenOf(appPid: number): ChildRow[] {
	if (process.platform === "win32") {
		return listWindowsProcesses()
			.filter((row) => row.ppid === appPid)
			.map((row) => ({
				pid: row.pid,
				text: row.commandLine,
				name: row.name,
			}));
	}
	return listPosixProcesses()
		.filter((row) => row.ppid === appPid)
		.map((row) => ({ pid: row.pid, text: row.args, name: "" }));
}

function isExiftoolRow(row: ChildRow, exiftoolPath: string): boolean {
	if (process.platform === "win32") {
		return row.name.toLowerCase() === "exiftool.exe";
	}
	return row.text.includes(exiftoolPath) && row.text.includes("-stay_open");
}

/** Signals a recorded pid only while its process-table identity still matches what was recorded. */
function killRecorded(recorded: Map<number, ChildRow>): void {
	for (const [pid, identity] of recorded) {
		try {
			if (process.platform === "win32") {
				const live = listWindowsProcesses().find((row) => row.pid === pid);
				if (live === undefined || live.name !== identity.name) {
					continue;
				}
				spawnSync("taskkill", ["/PID", String(pid), "/F"], {
					windowsHide: true,
				});
			} else {
				const live = listPosixProcesses().find((row) => row.pid === pid);
				if (
					live === undefined ||
					live.stat.startsWith("Z") ||
					live.args !== identity.text
				) {
					continue;
				}
				process.kill(pid, "SIGKILL");
			}
		} catch {
			// already gone
		}
	}
}

/** SIGKILLs a twin pid only while its args still name the installed exiftool or the parent helper. */
function killTwin(pid: number, exiftoolPath: string): void {
	try {
		const live = listPosixProcesses().find((row) => row.pid === pid);
		if (
			live === undefined ||
			live.stat.startsWith("Z") ||
			(!live.args.includes(exiftoolPath) &&
				!live.args.includes("orphan_parent"))
		) {
			return;
		}
		process.kill(pid, "SIGKILL");
	} catch {
		// already gone
	}
}

test("a force-killed packaged app leaves no ExifTool child running (LIF-01, D-09)", async () => {
	const context = await launchPackagedApp();
	const playwrightPid = context.app.process().pid;
	expect(
		playwrightPid,
		"D-09 step 2: app.process().pid is defined",
	).toBeDefined();
	if (playwrightPid === undefined) {
		throw new Error("D-09 step 2: Playwright reported no app pid");
	}
	const mainPid = await context.app.evaluate(() => process.pid);
	// POSIX: Playwright spawns the Electron main process directly, so the two pids are equal.
	// Windows: PR #392 CI run 39353789499 measured them different (7648 vs 9436). ExifTool is a
	// child of the Electron main process (the process whose libuv job object holds it), so the
	// in-app pid is the one to look children up under and to kill.
	if (process.platform === "win32") {
		const table = listWindowsProcesses();
		const describe = (pid: number): string => {
			const row = table.find((candidate) => candidate.pid === pid);
			return row === undefined
				? "absent"
				: `${row.name} ppid=${row.ppid} ${row.commandLine}`;
		};
		console.log(
			`SMOKE_WIN_PIDS playwright=${playwrightPid} (${describe(playwrightPid)}) main=${mainPid} (${describe(mainPid)})`,
		);
		expect(
			table.some((row) => row.pid === mainPid),
			"D-09 step 2: the in-app Electron main pid is in the process table",
		).toBe(true);
	} else {
		expect(
			mainPid,
			"D-09 step 2: app.process().pid is the Electron main pid",
		).toBe(playwrightPid);
	}
	const appPid = mainPid;

	const configPath = path.join(
		context.resourcesPath,
		"nix",
		"exiftool-config",
		"watchdog.config",
	);
	const originalResources = packagedResourcesPath(
		context.originalExecutablePath,
		process.platform,
	);
	const recorded = new Map<number, ChildRow>();
	const twinOwned: number[] = [];

	try {
		// D-09 step 1: the packaged config is the reviewed one and ExifTool loads it cleanly.
		if (process.platform === "win32") {
			expect
				.soft(
					fs.existsSync(configPath),
					"D-09 step 1: win32 ships no watchdog config",
				)
				.toBe(false);
		} else {
			const repoHash = sha256(REPO_CONFIG);
			const originalConfig = path.join(
				originalResources,
				"nix",
				"exiftool-config",
				"watchdog.config",
			);
			for (const candidate of [configPath, originalConfig]) {
				const present = fs.existsSync(candidate);
				expect
					.soft(present, `D-09 step 1: config exists at ${candidate}`)
					.toBe(true);
				if (present) {
					expect
						.soft(
							sha256(candidate),
							`D-09 step 1: sha256 of ${candidate} equals the repo copy`,
						)
						.toBe(repoHash);
				}
			}
			expect
				.soft(
					exiftoolSpawnArgs({ platform: process.platform, configPath })[1],
					"D-09 step 1: the spawn builder points at the packaged config",
				)
				.toBe(configPath);
			const clean = spawnSync(
				context.exiftoolPath,
				["-config", configPath, "-ver"],
				{ encoding: "utf8" },
			);
			expect
				.soft(
					clean.stderr,
					"D-09 step 1: the installed exiftool loads the config with empty stderr",
				)
				.toBe("");
			const bogus = spawnSync(
				context.exiftoolPath,
				[
					"-config",
					path.join(
						context.resourcesPath,
						"nix",
						"exiftool-config",
						"missing.config",
					),
					"-ver",
				],
				{ encoding: "utf8" },
			);
			expect
				.soft(
					bogus.stderr,
					"D-09 step 1: a bogus config path is reported (the load check can fail)",
				)
				.toContain("Config file not found");
		}

		// D-09 step 2: exactly one ExifTool process is parented to the Electron main process.
		let rows: ChildRow[] = [];
		const findStart = Date.now();
		while (Date.now() - findStart < 20_000) {
			rows = childrenOf(appPid).filter((row) =>
				isExiftoolRow(row, context.exiftoolPath),
			);
			if (rows.length > 0) {
				break;
			}
			await sleep(200);
		}
		await sleep(500);
		const siblings = childrenOf(appPid);
		for (const row of siblings) {
			recorded.set(row.pid, row);
		}
		rows = siblings.filter((row) => isExiftoolRow(row, context.exiftoolPath));
		expect(
			rows.length,
			`D-09 step 2: exactly one ExifTool child of pid ${appPid}, saw ${JSON.stringify(rows)}`,
		).toBe(1);
		const exiftoolRow = rows[0];
		if (exiftoolRow === undefined) {
			throw new Error("D-09 step 2: no ExifTool child row");
		}
		if (process.platform === "win32") {
			expect
				.soft(
					exiftoolRow.text,
					"D-09 step 2: win32 command line has -stay_open",
				)
				.toContain("-stay_open");
			expect
				.soft(
					exiftoolRow.text.includes("-config"),
					"D-09 step 2: win32 command line has no -config",
				)
				.toBe(false);
		} else {
			expect
				.soft(
					exiftoolRow.text.endsWith(
						`${context.exiftoolPath} -config ${configPath} -stay_open True -@ -`,
					),
					`D-09 step 2: argv ends with the packaged config, saw ${exiftoolRow.text}`,
				)
				.toBe(true);
		}

		// D-09 step 3: kill only the app process. app.process().kill() sets .killed, so
		// Playwright's group kill (which would end the ExifTool child itself) is skipped.
		if (process.platform === "win32") {
			// Kill the Electron main process itself (TerminateProcess), then mark Playwright's handle
			// killed so its cleanup does not tree-kill the ExifTool child on our behalf.
			process.kill(appPid, "SIGKILL");
		}
		context.app.process().kill("SIGKILL");

		// D-09 step 4: the child must end by itself.
		const { gone, elapsedMs } =
			process.platform === "win32"
				? await pollUntilGoneWin32({
						pid: exiftoolRow.pid,
						timeoutMs: 5000,
						intervalMs: 100,
					})
				: await pollUntilGone({
						pid: exiftoolRow.pid,
						timeoutMs: 5000,
						intervalMs: 100,
					});
		console.log(
			`SMOKE_ORPHAN_EXIT_MS=${elapsedMs} platform=${process.platform}`,
		);
		let survivor = "";
		if (!gone) {
			const live =
				process.platform === "win32"
					? listWindowsProcesses()
							.filter((row) => row.pid === exiftoolRow.pid)
							.map((row) => `${row.name} ${row.commandLine}`)
					: listPosixProcesses()
							.filter((row) => row.pid === exiftoolRow.pid)
							.map((row) => `${row.stat} ${row.args}`);
			survivor = live.join("") === "" ? "pid reused or gone" : live.join("");
		}
		expect(
			gone,
			`D-09 step 4: ExifTool pid ${exiftoolRow.pid} outlived the app by ${elapsedMs} ms (${survivor})`,
		).toBe(true);

		// D-09 step 5 (POSIX): the installed ExifTool, hosted by the production ExiftoolProcess in a
		// separate parent. Windows behaviour is covered by the job-object probe (D-10).
		if (process.platform !== "win32") {
			const readyFile = path.join(
				REPO_ROOT,
				"tests/e2e/fixtures/no_metadata.jpg",
			);

			const negative = await startOrphanParent({
				spec: {
					mode: "class",
					binPath: context.exiftoolPath,
					readyFile,
				},
				repoRoot: REPO_ROOT,
				owned: twinOwned,
			});
			process.kill(negative.parentPid, "SIGKILL");
			await sleep(2000);
			const negativeRow = listPosixProcesses().find(
				(row) => row.pid === negative.childPid,
			);
			expect(
				negativeRow,
				"D-09 step 5: without -config the installed ExifTool child survives its parent",
			).toBeDefined();
			expect(
				negativeRow?.stat.startsWith("Z"),
				"D-09 step 5: the surviving negative-control child is not a zombie",
			).toBe(false);
			expect(
				negativeRow?.ppid,
				"D-09 step 5: the surviving negative-control child was re-parented",
			).not.toBe(negative.parentPid);
			console.log(`SMOKE_TWIN_NEGATIVE_ALIVE_PPID=${negativeRow?.ppid}`);
			killTwin(negative.childPid, context.exiftoolPath);

			const positive = await startOrphanParent({
				spec: {
					mode: "class",
					binPath: context.exiftoolPath,
					configPath,
					readyFile,
				},
				repoRoot: REPO_ROOT,
				owned: twinOwned,
			});
			process.kill(positive.parentPid, "SIGKILL");
			const twin = await pollUntilGone({
				pid: positive.childPid,
				timeoutMs: 5000,
				intervalMs: 100,
			});
			console.log(`SMOKE_TWIN_POSITIVE_EXIT_MS=${twin.elapsedMs}`);
			expect(
				twin.gone,
				`D-09 step 5: with the installed config the child ends after its parent (${twin.elapsedMs} ms)`,
			).toBe(true);
		}
	} finally {
		// D-09 step 6: no survivor, no temp dir, installed payload untouched.
		killRecorded(recorded);
		if (process.platform !== "win32") {
			for (const pid of twinOwned) {
				killTwin(pid, context.exiftoolPath);
			}
		}
		if (process.platform !== "win32") {
			try {
				process.kill(-appPid, "SIGKILL");
			} catch {
				// group already gone
			}
		}
		fs.rmSync(context.userDataDir, {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 200,
		});
		fs.rmSync(context.neutralCwd, {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 200,
		});
		await assertInstalledPayloadUnchanged(context);
	}
});
