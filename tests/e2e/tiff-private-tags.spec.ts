import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { closeApp, launchApp } from "./helpers/app_launcher";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import { createProcessingDriver } from "../helpers/processing_driver";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import {
	readTiffGroupedTags,
	retainedPrivateTags,
	gpsKeys,
	findSentinels,
	readSingleStrip,
} from "../helpers/tiff_probe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");
// The pristine, committed fixture -- never the temp copy, since overwrite mode replaces the
// temp copy in place (D-27).
const PRISTINE_FIXTURE = path.resolve(__dirname, "fixtures/sample.tif");

// This spec launches with NO settings override -- default settings are the point (RMV-03).
// file-type-coverage.spec.ts launches with orientation/color-profile preservation switched
// off, so it cannot double as evidence for a default-settings claim (D-26).
test.describe("TIFF private-tag removal — copy mode, default settings", () => {
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

	test("copy mode: a default clean removes the four IFD0 private tags and GPS through the real IPC path", async () => {
		const driver = createProcessingDriver({
			app,
			window,
			exiftoolPath: EXIFTOOL_PATH,
		});
		const { dir, copyFixture, cleanup } = createFixtureDir();
		const consoleErrors: string[] = [];
		window.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		try {
			const filePath = copyFixture("sample.tif");
			const outputPath = generateCleanedPath({
				filePath,
				exists: fs.existsSync,
			});
			const before = snapshotDir(dir);
			await driver.submitFiles([filePath]);
			await driver.waitForTerminal();
			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: [],
				added: [path.basename(outputPath)],
				removed: [],
				unchanged: ["sample.tif"],
			});
			expect(await driver.terminalRowCounts()).toEqual({
				total: 1,
				complete: 1,
				error: 0,
			});

			const tags = readTiffGroupedTags(outputPath, EXIFTOOL_PATH);
			expect(retainedPrivateTags(tags, "IFD0")).toEqual([]);
			expect(gpsKeys(tags)).toEqual([]);
			expect(
				findSentinels(outputPath, [
					"ZZP51-DESC",
					"ZZP51-SOFT",
					"ZZP51-ARTIST",
					"ZZP51-COPY",
				]),
			).toEqual([]);

			const outputStrip = readSingleStrip(outputPath, "IFD0", EXIFTOOL_PATH);
			const pristineStrip = readSingleStrip(
				PRISTINE_FIXTURE,
				"IFD0",
				EXIFTOOL_PATH,
			);
			expect(outputStrip.bytes.length).toBe(16);
			expect(pristineStrip.bytes.length).toBe(16);
			expect(outputStrip.bytes.equals(pristineStrip.bytes)).toBe(true);
		} finally {
			cleanup();
		}

		expect(consoleErrors).toEqual([]);
	});
});

// A default clean, overwrite mode: only saveAsCopy is overridden off default -- every other
// setting stays default (RMV-03). D-24 routes TIFF through the verified transaction in BOTH
// output modes, so this proves criterion 1's second half.
test.describe("TIFF private-tag removal — overwrite mode", () => {
	let app: ElectronApplication;
	let window: Page;

	test.beforeEach(async () => {
		const launched = await launchApp({ settings: { saveAsCopy: false } });
		app = launched.app;
		window = launched.window;
	});

	test.afterEach(async () => {
		if (app) await closeApp(app);
	});

	test("overwrite mode: a default clean removes the four IFD0 private tags and GPS in place through the real IPC path", async () => {
		const driver = createProcessingDriver({
			app,
			window,
			exiftoolPath: EXIFTOOL_PATH,
		});
		const { dir, copyFixture, cleanup } = createFixtureDir();
		const consoleErrors: string[] = [];
		window.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		try {
			const filePath = copyFixture("sample.tif");
			const before = snapshotDir(dir);
			await driver.submitFiles([filePath]);
			await driver.waitForTerminal();
			const after = snapshotDir(dir);

			// An empty `added` is the observable proof the verified transaction's stage file
			// was renamed onto the original and left no residue (D-24).
			assertDirEffect(before, after, {
				modified: ["sample.tif"],
				added: [],
				removed: [],
			});
			expect(await driver.terminalRowCounts()).toEqual({
				total: 1,
				complete: 1,
				error: 0,
			});

			const tags = readTiffGroupedTags(filePath, EXIFTOOL_PATH);
			expect(retainedPrivateTags(tags, "IFD0")).toEqual([]);
			expect(gpsKeys(tags)).toEqual([]);
			expect(
				findSentinels(filePath, [
					"ZZP51-DESC",
					"ZZP51-SOFT",
					"ZZP51-ARTIST",
					"ZZP51-COPY",
				]),
			).toEqual([]);

			const outputStrip = readSingleStrip(filePath, "IFD0", EXIFTOOL_PATH);
			const pristineStrip = readSingleStrip(
				PRISTINE_FIXTURE,
				"IFD0",
				EXIFTOOL_PATH,
			);
			expect(outputStrip.bytes.length).toBe(16);
			expect(pristineStrip.bytes.length).toBe(16);
			expect(outputStrip.bytes.equals(pristineStrip.bytes)).toBe(true);
		} finally {
			cleanup();
		}

		expect(consoleErrors).toEqual([]);
	});
});
