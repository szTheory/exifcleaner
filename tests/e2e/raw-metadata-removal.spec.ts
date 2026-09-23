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
	readRawTags,
	retainedIdentifyingKeys,
	decoderTagMismatches,
	readImageDataHash,
	findSentinelBytes,
	RAW_CASES,
	RAW_SENTINELS,
} from "../helpers/raw_probe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

// RAW is always forced-copy (exif_handlers.ts's wasForcedCopy) -- no overwrite-mode describe
// block here (RESEARCH Pitfall 2). This spec launches with NO settings override -- default
// settings are the point (RMV-05).
test.describe("RAW identifying-tag removal — forced copy, default settings", () => {
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

	for (const raw of RAW_CASES) {
		test(`forced copy: a default clean of ${raw.fixture} removes identifying tags and keeps decoder tags and image data, through the real IPC path`, async () => {
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
				const filePath = copyFixture(raw.fixture);
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
					unchanged: [raw.fixture],
				});
				expect(await driver.terminalRowCounts()).toEqual({
					total: 1,
					complete: 1,
					error: 0,
				});

				const sourceTags = readRawTags(filePath, EXIFTOOL_PATH, {
					numeric: true,
				});
				const outputTags = readRawTags(outputPath, EXIFTOOL_PATH, {
					numeric: true,
				});

				// Non-vacuity: the source must actually carry every claimed identifying key
				// before the output's absence of it means anything.
				const sourceIdentifying = retainedIdentifyingKeys(sourceTags, []);
				for (const key of raw.sourceIdentifyingKeys) {
					expect(sourceIdentifying).toContain(key);
				}

				expect(
					retainedIdentifyingKeys(outputTags, raw.residueAllowlist),
				).toEqual([]);
				expect(
					decoderTagMismatches(sourceTags, outputTags, raw.decoderKeys),
				).toEqual([]);

				const sourceHash = readImageDataHash(filePath, EXIFTOOL_PATH);
				const outputHash = readImageDataHash(outputPath, EXIFTOOL_PATH);
				expect(outputHash).toBe(sourceHash);
				expect(outputHash).toBe(raw.imageDataHash);

				expect(findSentinelBytes(filePath, RAW_SENTINELS)).toEqual([
					...RAW_SENTINELS,
				]);
				expect(findSentinelBytes(outputPath, RAW_SENTINELS)).toEqual([]);
			} finally {
				cleanup();
			}

			expect(consoleErrors).toEqual([]);
		});
	}
});
