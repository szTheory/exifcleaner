import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { closeApp, launchApp } from "./helpers/app_launcher";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import { createProcessingDriver } from "../helpers/processing_driver";
import { findSentinelBytes, readRawTagLines } from "../helpers/raw_probe";
import {
	GENERIC_SEED_ARGS,
	JPEG_CONFLICT_RESOLUTION_ARGS,
	RESOLUTION_SENTINELS,
	resolutionDeltaViolations,
	resolutionLines,
	seedFile,
	seededTagKeys,
} from "../helpers/resolution_probe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Helper functions, not inline arrows, so the local `window: Page` variable in the
// describe block below never shadows the browser-global `window` referenced inside
// page.evaluate's callback.
async function getSettings(page: Page): Promise<{ preserveResolution: boolean }> {
	return page.evaluate(() => window.api.settings.get());
}

async function setPreserveResolution(page: Page, value: boolean): Promise<void> {
	await page.evaluate(
		(preserveResolution) => window.api.settings.set({ preserveResolution }),
		value,
	);
}

test.describe("Resolution preservation — default settings, real IPC path", () => {
	let app: ElectronApplication;
	let window: Page;

	test.beforeEach(async () => {
		const launched = await launchApp();
		app = launched.app;
		window = launched.window;
	});

	test.afterEach(async () => {
		if (app) await closeApp(app);
	});

	test("a default clean keeps a JPEG's JFIF and EXIF resolution exactly as the source recorded them and still removes GPS, Artist, Software and Comment (FID-01, D-31)", async () => {
		const driver = createProcessingDriver({
			app,
			window,
			exiftoolPath: EXIFTOOL_PATH,
		});
		const consoleErrors: string[] = [];
		window.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		const defaultSettings = await getSettings(window);
		expect(defaultSettings.preserveResolution).toBe(true);

		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const onPath = copyFixture("sample.jpg");
			const offPath = path.join(dir, "off.jpg");
			fs.copyFileSync(onPath, offPath);
			const renamedOnPath = path.join(dir, "on.jpg");
			fs.renameSync(onPath, renamedOnPath);

			const seedExpected = {
				"JFIF:XResolution": "300",
				"IFD0:XResolution": "72",
				"IFD0:Artist": "ZZP52-ARTIST",
				"File:Comment": "ZZP52-COMMENT",
			};
			seedFile(
				renamedOnPath,
				EXIFTOOL_PATH,
				[...JPEG_CONFLICT_RESOLUTION_ARGS, ...GENERIC_SEED_ARGS],
				seedExpected,
			);
			seedFile(
				offPath,
				EXIFTOOL_PATH,
				[...JPEG_CONFLICT_RESOLUTION_ARGS, ...GENERIC_SEED_ARGS],
				seedExpected,
			);

			expect(sha256(renamedOnPath)).toBe(sha256(offPath));

			const sourceLines = readRawTagLines(renamedOnPath, EXIFTOOL_PATH);

			const before = snapshotDir(dir);
			await driver.submitFiles([renamedOnPath]);
			await driver.waitForTerminal();

			await setPreserveResolution(window, false);
			const deadline = Date.now() + 5000;
			for (;;) {
				const current = await getSettings(window);
				if (current.preserveResolution === false) break;
				if (Date.now() > deadline) {
					throw new Error(
						"settings.set({ preserveResolution: false }) did not take effect",
					);
				}
				await window.waitForTimeout(50);
			}

			await driver.submitFiles([offPath]);
			await driver.waitForTerminal({ expectedFiles: 2 });
			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				added: ["on_cleaned.jpg", "off_cleaned.jpg"],
				modified: [],
				removed: [],
				unchanged: ["on.jpg", "off.jpg"],
			});
			expect(await driver.terminalRowCounts()).toEqual({
				total: 2,
				complete: 2,
				error: 0,
			});
			expect(consoleErrors).toEqual([]);

			const onOutput = path.join(dir, "on_cleaned.jpg");
			const offOutput = path.join(dir, "off_cleaned.jpg");
			const onLines = readRawTagLines(onOutput, EXIFTOOL_PATH);
			const offLines = readRawTagLines(offOutput, EXIFTOOL_PATH);

			expect(resolutionLines(onLines)).toEqual([
				"JFIF:ResolutionUnit : 1",
				"JFIF:XResolution : 300",
				"JFIF:YResolution : 300",
				"IFD0:XResolution : 72",
				"IFD0:YResolution : 72",
				"IFD0:ResolutionUnit : 2",
			]);
			expect(
				resolutionLines(offLines).filter(
					(line) => line.startsWith("JFIF:") || line.startsWith("IFD0:"),
				),
			).toEqual([]);

			expect(seededTagKeys(onLines)).toEqual([]);
			expect(seededTagKeys(sourceLines).length).toBeGreaterThan(0);

			expect(findSentinelBytes(onOutput, RESOLUTION_SENTINELS)).toEqual([]);
			expect(findSentinelBytes(renamedOnPath, RESOLUTION_SENTINELS)).toEqual([
				...RESOLUTION_SENTINELS,
			]);

			expect(
				resolutionDeltaViolations({
					source: sourceLines,
					off: offLines,
					on: onLines,
					companions: [
						"File:ExifByteOrder",
						"JFIF:JFIFVersion",
						"IFD0:YCbCrPositioning",
					],
				}),
			).toEqual([]);
		} finally {
			cleanup();
		}
	});
});
