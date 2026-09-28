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
import {
	JFIF_ONLY_COMPANIONS,
	JFIF_ONLY_SEED_ARGS,
	JPEG_BOTH_300_ARGS,
	JPEG_EXIF_COMPANIONS,
	PNG_PHYS_SEED_ARGS,
} from "../helpers/resolution_matrix";

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
async function getSettings(
	page: Page,
): Promise<{ preserveResolution: boolean }> {
	return page.evaluate(() => window.api.settings.get());
}

async function setPreserveResolution(
	page: Page,
	value: boolean,
): Promise<void> {
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

	test("one default batch keeps a PNG's pHYs and a JPEG's JFIF and EXIF 300 dpi, and a JFIF-only JPEG gains no EXIF (FID-02, D-31)", async () => {
		const driver = createProcessingDriver({
			app,
			window,
			exiftoolPath: EXIFTOOL_PATH,
		});
		const consoleErrors: string[] = [];
		window.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const bothPath = path.join(dir, "both.jpg");
			fs.copyFileSync(copyFixture("sample.jpg"), bothPath);
			fs.rmSync(path.join(dir, "sample.jpg"));
			const physPath = path.join(dir, "phys.png");
			fs.copyFileSync(copyFixture("sample.png"), physPath);
			fs.rmSync(path.join(dir, "sample.png"));
			const jfifPath = path.join(dir, "jfif.jpg");
			fs.copyFileSync(copyFixture("no_metadata.jpg"), jfifPath);
			fs.rmSync(path.join(dir, "no_metadata.jpg"));

			seedFile(
				bothPath,
				EXIFTOOL_PATH,
				[...JPEG_BOTH_300_ARGS, ...GENERIC_SEED_ARGS],
				{ "IFD0:XResolution": "300", "IFD0:Artist": "ZZP52-ARTIST" },
			);
			seedFile(physPath, EXIFTOOL_PATH, [...PNG_PHYS_SEED_ARGS], {
				"PNG-pHYs:PixelsPerUnitX": "11811",
				"PNG:Artist": "ZZP52-ARTIST",
			});
			seedFile(jfifPath, EXIFTOOL_PATH, [...JFIF_ONLY_SEED_ARGS], {
				"JFIF:XResolution": "300",
				"File:Comment": "ZZP52-COMMENT",
			});

			const bothOffPath = path.join(dir, "both_off.jpg");
			fs.copyFileSync(bothPath, bothOffPath);
			const physOffPath = path.join(dir, "phys_off.png");
			fs.copyFileSync(physPath, physOffPath);
			const jfifOffPath = path.join(dir, "jfif_off.jpg");
			fs.copyFileSync(jfifPath, jfifOffPath);

			expect(sha256(bothPath)).toBe(sha256(bothOffPath));
			expect(sha256(physPath)).toBe(sha256(physOffPath));
			expect(sha256(jfifPath)).toBe(sha256(jfifOffPath));

			const before = snapshotDir(dir);
			await driver.submitFiles([bothPath, physPath, jfifPath]);
			await driver.waitForTerminal({ expectedFiles: 3 });

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

			await driver.submitFiles([bothOffPath, physOffPath, jfifOffPath]);
			await driver.waitForTerminal({ expectedFiles: 6 });
			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				added: [
					"both_cleaned.jpg",
					"phys_cleaned.png",
					"jfif_cleaned.jpg",
					"both_off_cleaned.jpg",
					"phys_off_cleaned.png",
					"jfif_off_cleaned.jpg",
				],
				modified: [],
				removed: [],
				unchanged: [
					"both.jpg",
					"phys.png",
					"jfif.jpg",
					"both_off.jpg",
					"phys_off.png",
					"jfif_off.jpg",
				],
			});
			expect(await driver.terminalRowCounts()).toEqual({
				total: 6,
				complete: 6,
				error: 0,
			});
			expect(consoleErrors).toEqual([]);

			const bothOnOutput = path.join(dir, "both_cleaned.jpg");
			const physOnOutput = path.join(dir, "phys_cleaned.png");
			const jfifOnOutput = path.join(dir, "jfif_cleaned.jpg");

			const bothOnLines = readRawTagLines(bothOnOutput, EXIFTOOL_PATH);
			const physOnLines = readRawTagLines(physOnOutput, EXIFTOOL_PATH);
			const jfifOnLines = readRawTagLines(jfifOnOutput, EXIFTOOL_PATH);

			expect(resolutionLines(physOnLines)).toEqual([
				"PNG-pHYs:PixelsPerUnitX : 11811",
				"PNG-pHYs:PixelsPerUnitY : 11811",
				"PNG-pHYs:PixelUnits : 1",
			]);
			expect(resolutionLines(bothOnLines)).toEqual([
				"JFIF:ResolutionUnit : 1",
				"JFIF:XResolution : 300",
				"JFIF:YResolution : 300",
				"IFD0:XResolution : 300",
				"IFD0:YResolution : 300",
				"IFD0:ResolutionUnit : 2",
			]);
			expect(
				jfifOnLines.filter(
					(line) =>
						line.key.startsWith("IFD0:") ||
						line.key.startsWith("ExifIFD:") ||
						line.key === "File:ExifByteOrder",
				),
			).toEqual([]);

			const bothSourceLines = readRawTagLines(bothOffPath, EXIFTOOL_PATH);
			const physSourceLines = readRawTagLines(physOffPath, EXIFTOOL_PATH);
			const jfifSourceLines = readRawTagLines(jfifOffPath, EXIFTOOL_PATH);
			const bothOffLines = readRawTagLines(
				path.join(dir, "both_off_cleaned.jpg"),
				EXIFTOOL_PATH,
			);
			const physOffLines = readRawTagLines(
				path.join(dir, "phys_off_cleaned.png"),
				EXIFTOOL_PATH,
			);
			const jfifOffLines = readRawTagLines(
				path.join(dir, "jfif_off_cleaned.jpg"),
				EXIFTOOL_PATH,
			);

			expect(
				resolutionDeltaViolations({
					source: bothSourceLines,
					off: bothOffLines,
					on: bothOnLines,
					companions: JPEG_EXIF_COMPANIONS,
				}),
			).toEqual([]);
			expect(
				resolutionDeltaViolations({
					source: physSourceLines,
					off: physOffLines,
					on: physOnLines,
					companions: [],
				}),
			).toEqual([]);
			expect(
				resolutionDeltaViolations({
					source: jfifSourceLines,
					off: jfifOffLines,
					on: jfifOnLines,
					companions: JFIF_ONLY_COMPANIONS,
				}),
			).toEqual([]);

			expect(seededTagKeys(bothOnLines)).toEqual([]);
			expect(seededTagKeys(physOnLines)).toEqual([]);
			expect(seededTagKeys(jfifOnLines)).toEqual([]);

			expect(findSentinelBytes(bothOnOutput, RESOLUTION_SENTINELS)).toEqual([]);
			expect(findSentinelBytes(physOnOutput, RESOLUTION_SENTINELS)).toEqual([]);
			expect(findSentinelBytes(jfifOnOutput, RESOLUTION_SENTINELS)).toEqual([]);
		} finally {
			cleanup();
		}
	});
});
