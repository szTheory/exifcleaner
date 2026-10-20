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

test("a force-killed packaged app leaves no ExifTool child running (LIF-01, D-09)", async () => {
	const context = await launchPackagedApp();
	const appPid = context.app.process().pid;
	expect(appPid, "D-09 step 2: app.process().pid is defined").toBeDefined();
	if (appPid === undefined) {
		throw new Error("D-09 step 2: Playwright reported no app pid");
	}
	expect(
		await context.app.evaluate(() => process.pid),
		"D-09 step 2: app.process().pid is the Electron main pid",
	).toBe(appPid);

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
	} finally {
		// D-09 step 6: no survivor, no temp dir, installed payload untouched.
		killRecorded(recorded);
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
