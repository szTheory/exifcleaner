import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { closeApp, launchApp } from "./helpers/app_launcher";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import {
	createProcessingDriver,
	runMixedFormatScenario,
	runPositiveFormatScenario,
	runErrorFormatScenario,
	runRafRefusalScenario,
	SUPPORTED_FORMAT_FIXTURES,
	type ProcessingLaunchContext,
} from "../helpers/processing_driver";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

test.describe("File type coverage", () => {
	let app: ElectronApplication;
	let window: Page;

	function context(): ProcessingLaunchContext {
		return { app, window, exiftoolPath: EXIFTOOL_PATH };
	}

	test.beforeEach(async () => {
		const launched = await launchApp({
			settings: {
				preserveColorProfile: false,
				preserveOrientation: false,
				saveAsCopy: true,
			},
		});
		app = launched.app;
		window = launched.window;
	});

	test.afterEach(async () => {
		if (app) await closeApp(app);
	});

	for (const fixture of SUPPORTED_FORMAT_FIXTURES) {
		const testName =
			fixture === "sample.mp4"
				? "MP4 valid control strips metadata"
				: `${fixture} strips metadata`;
		test(testName, async () => {
			await runPositiveFormatScenario(context(), fixture);
		});
	}

	test("mixed batch strips metadata from every advertised format", async () => {
		await runMixedFormatScenario(context());
	});

	test("corrupted JPEG reports detailed error output", async () => {
		await runErrorFormatScenario(context(), "corrupted.jpg");
	});

	test("truncated MP4 rejects before output", async () => {
		await runErrorFormatScenario(context(), "truncated.mp4");
	});

	test("RAF is refused without modifying the original or writing an artifact", async () => {
		await runRafRefusalScenario(context());
	});

	test("comment-only JPEG is counted and stripped rather than reported already clean", async () => {
		const SENTINEL = "ZZPHASE50COMMENTZZ";
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			// createFixtureDir copies fixtures by their literal name only, so the
			// comment-only fixture is produced by copying no_metadata.jpg and
			// renaming the copy inside the same temp directory.
			const noMetadataPath = copyFixture("no_metadata.jpg");
			const commentOnlyPath = path.join(dir, "comment_only.jpg");
			fs.copyFileSync(noMetadataPath, commentOnlyPath);
			fs.unlinkSync(noMetadataPath);

			// Seed a distinctive free-text comment directly with the bundled binary.
			const { stdout: seedStdout } = await execFileAsync(EXIFTOOL_PATH, [
				"-overwrite_original",
				`-Comment=${SENTINEL}`,
				commentOnlyPath,
			]);

			// D-16a two-part gate, non-negotiable: a bare substring match on "updated"
			// is insufficient -- "0 image files updated" contains that word too, and
			// that exact mistake previously scored a miss as a hit in this phase's
			// research. Require BOTH an updated count strictly greater than zero AND a
			// read-back confirming the sentinel landed under a group1 File key.
			const updatedMatch = seedStdout
				.trim()
				.match(/^(\d+) image files? updated$/);
			const updatedCount = updatedMatch ? Number(updatedMatch[1]) : 0;
			expect(
				updatedCount,
				`seed gate half 1 (updated count > 0) failed: exiftool reported "${seedStdout.trim()}"`,
			).toBeGreaterThan(0);

			const { stdout: seedReadBack } = await execFileAsync(EXIFTOOL_PATH, [
				"-G1:2:4",
				"-j",
				commentOnlyPath,
			]);
			const seedRecord =
				(JSON.parse(seedReadBack) as Record<string, unknown>[])[0] ?? {};
			const seedKey = Object.entries(seedRecord).find(
				([key, value]) =>
					key.split(":")[0] === "File" &&
					typeof value === "string" &&
					value.includes(SENTINEL),
			);
			expect(
				seedKey,
				`seed gate half 2 (read-back under a File-group key) failed: read-back was ${seedReadBack}`,
			).toBeDefined();

			// Snapshot AFTER the seed write, so the seed's own overwrite is not itself
			// counted as a mutation the app is responsible for.
			const outputPath = generateCleanedPath({
				filePath: commentOnlyPath,
				exists: fs.existsSync,
			});
			const driver = createProcessingDriver(context());
			const before = snapshotDir(dir);
			await driver.submitFiles([commentOnlyPath]);
			await driver.waitForTerminal();
			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: [],
				added: [path.basename(outputPath)],
				removed: [],
				unchanged: ["comment_only.jpg"],
			});
			expect(await driver.terminalRowCounts()).toEqual({
				total: 1,
				complete: 1,
				error: 0,
			});

			// Raw read is deliberate: assertMetadataStripped filters every File-prefixed
			// key, so it cannot see this tag and must not be the load-bearing assertion.
			const { stdout: outputReadBack } = await execFileAsync(EXIFTOOL_PATH, [
				"-G1:2:4",
				"-j",
				outputPath,
			]);
			expect(outputReadBack).not.toContain(SENTINEL);
		} finally {
			cleanup();
		}
	});
});
