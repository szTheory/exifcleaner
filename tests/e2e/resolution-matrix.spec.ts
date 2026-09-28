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
import { readRawTagLines } from "../helpers/raw_probe";
import {
	RESOLUTION_SENTINELS,
	resolutionDeltaViolations,
	seededTagKeys,
} from "../helpers/resolution_probe";
import {
	RESOLUTION_MATRIX_ROWS,
	materializeRow,
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

// Mirrors processing_driver.ts's own (unexported) NATIVE_STAGE_RESIDUE_PATTERN /
// discoverNativeStageResidue: exifcleaner-node's native-route publication transaction
// deliberately retains a bounded, randomly-named staging directory on POSIX (Phase 46
// decision -- no atomic, identity-verified delete-by-handle primitive is available
// cross-platform). assertDirEffect has no ignore-list, so every run's actual residue
// name is discovered and named explicitly, exactly like every other observed mutation.
const NATIVE_STAGE_RESIDUE_PATTERN =
	/^\.exifcleaner-stage-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function discoverNativeStageResidue(
	before: ReturnType<typeof snapshotDir>,
	after: ReturnType<typeof snapshotDir>,
): string[] {
	const residue: string[] = [];
	for (const key of after.keys()) {
		if (!before.has(key) && NATIVE_STAGE_RESIDUE_PATTERN.test(key)) {
			residue.push(key);
		}
	}
	return residue;
}

function fileContainsSentinel(filePath: string, sentinel: string): boolean {
	const raw = fs.readFileSync(filePath);
	return (
		raw.toString("latin1").includes(sentinel) ||
		raw.toString("utf16le").includes(sentinel)
	);
}

test.describe("Resolution preservation matrix — real IPC path (FID-03, D-37, D-38)", () => {
	let app: ElectronApplication | undefined;
	let window: Page;

	test.afterEach(async () => {
		if (app) await closeApp(app);
		app = undefined;
	});

	test("every non-RAW supported format removes no less with Preserve resolution on than off (FID-03)", async () => {
		const onFixtures = createFixtureDir();
		const offFixtures = createFixtureDir();
		try {
			// Materialize every row into both dirs (byte-identical twins) before either
			// launch -- materializeRow seeds and FileType-asserts synchronously, so both
			// dirs are fully prepared before the app ever opens.
			const onPaths = new Map<string, string>();
			const offPaths = new Map<string, string>();
			for (const row of RESOLUTION_MATRIX_ROWS) {
				const name = `row${row.ext}`;
				const onPath = materializeRow(row, onFixtures.dir, name, EXIFTOOL_PATH);
				const offPath = materializeRow(
					row,
					offFixtures.dir,
					name,
					EXIFTOOL_PATH,
				);
				expect(sha256(onPath)).toBe(sha256(offPath));
				onPaths.set(row.ext, onPath);
				offPaths.set(row.ext, offPath);
			}

			const onBefore = snapshotDir(onFixtures.dir);
			const launchedOn = await launchApp();
			app = launchedOn.app;
			window = launchedOn.window;
			const onDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await onDriver.submitFiles([...onPaths.values()]);
			await onDriver.waitForTerminal({
				expectedFiles: RESOLUTION_MATRIX_ROWS.length,
				timeout: 60000,
			});
			const onCounts = await onDriver.terminalRowCounts();
			const onAfter = snapshotDir(onFixtures.dir);
			await closeApp(app);
			app = undefined;

			const offBefore = snapshotDir(offFixtures.dir);
			const launchedOff = await launchApp({
				settings: { preserveResolution: false },
			});
			app = launchedOff.app;
			window = launchedOff.window;
			const offDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await offDriver.submitFiles([...offPaths.values()]);
			await offDriver.waitForTerminal({
				expectedFiles: RESOLUTION_MATRIX_ROWS.length,
				timeout: 60000,
			});
			const offCounts = await offDriver.terminalRowCounts();
			const offAfter = snapshotDir(offFixtures.dir);
			await closeApp(app);
			app = undefined;

			// Result parity (D-38c): ON and OFF give identical terminal outcomes.
			expect(onCounts).toEqual(offCounts);
			expect(onCounts.total).toBe(RESOLUTION_MATRIX_ROWS.length);

			const addedOn: string[] = [];
			const addedOff: string[] = [];
			for (const row of RESOLUTION_MATRIX_ROWS) {
				if (!row.writable) continue;
				const onSrc = onPaths.get(row.ext)!;
				const offSrc = offPaths.get(row.ext)!;
				const onOutName = `row_cleaned${row.ext}`;
				addedOn.push(onOutName);
				addedOff.push(onOutName);
				const onOut = path.join(onFixtures.dir, onOutName);
				const offOut = path.join(offFixtures.dir, onOutName);
				expect(fs.existsSync(onOut)).toBe(true);
				expect(fs.existsSync(offOut)).toBe(true);

				const sourceLines = readRawTagLines(onSrc, EXIFTOOL_PATH);
				const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
				const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);

				expect(seededTagKeys(onLines)).toEqual([]);
				const onSentinels = RESOLUTION_SENTINELS.filter((s) =>
					fileContainsSentinel(onOut, s),
				);
				const offSentinels = RESOLUTION_SENTINELS.filter((s) =>
					fileContainsSentinel(offOut, s),
				);
				for (const sentinel of onSentinels) {
					expect(offSentinels).toContain(sentinel);
				}

				expect(
					resolutionDeltaViolations({
						source: sourceLines,
						off: offLines,
						on: onLines,
						companions: row.companions,
					}),
				).toEqual([]);
			}

			assertDirEffect(onBefore, onAfter, {
				added: [...addedOn, ...discoverNativeStageResidue(onBefore, onAfter)],
				modified: [],
				removed: [],
				unchanged: [...onPaths.values()].map((p) => path.basename(p)),
			});
			assertDirEffect(offBefore, offAfter, {
				added: [
					...addedOff,
					...discoverNativeStageResidue(offBefore, offAfter),
				],
				modified: [],
				removed: [],
				unchanged: [...offPaths.values()].map((p) => path.basename(p)),
			});

			for (const row of RESOLUTION_MATRIX_ROWS) {
				if (row.writable) continue;
				const onSrc = onPaths.get(row.ext)!;
				const offSrc = offPaths.get(row.ext)!;
				expect(
					fs.existsSync(path.join(onFixtures.dir, `row_cleaned${row.ext}`)),
				).toBe(false);
				expect(
					fs.existsSync(path.join(offFixtures.dir, `row_cleaned${row.ext}`)),
				).toBe(false);
			}
		} finally {
			onFixtures.cleanup();
			offFixtures.cleanup();
		}
	});

	test("WebP keeps its IFD0 resolution through ExifTool in overwrite mode and in Save-as-copy with Preserve resolution on (ADP-02)", async () => {
		const { dir, cleanup } = createFixtureDir();
		try {
			const overwritePath = path.join(dir, "overwrite.webp");
			fs.copyFileSync(
				path.resolve(__dirname, "fixtures/sample.webp"),
				overwritePath,
			);
			const { execFileSync } = await import("node:child_process");
			execFileSync(EXIFTOOL_PATH, [
				"-overwrite_original",
				"-IFD0:XResolution=300",
				"-IFD0:YResolution=300",
				"-IFD0:ResolutionUnit=inches",
				"-GPSLatitude=37.7749",
				"-GPSLatitudeRef=N",
				"-GPSLongitude=-122.4194",
				"-GPSLongitudeRef=W",
				"-Artist=ZZP52-ARTIST",
				"-Software=ZZP52-SOFT",
				"-Comment=ZZP52-COMMENT",
				overwritePath,
			]);
			const copyPath = path.join(dir, "copy.webp");
			fs.copyFileSync(overwritePath, copyPath);

			// ExifTool route: overwrite mode (saveAsCopy: false).
			const launchedOverwrite = await launchApp({
				settings: { saveAsCopy: false },
			});
			app = launchedOverwrite.app;
			window = launchedOverwrite.window;
			const overwriteDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await overwriteDriver.submitFiles([overwritePath]);
			await overwriteDriver.waitForTerminal();
			await closeApp(app);
			app = undefined;

			const overwriteLines = readRawTagLines(overwritePath, EXIFTOOL_PATH);
			const overwriteResolution = overwriteLines
				.filter((line) => line.key.startsWith("IFD0:"))
				.map((line) => `${line.key} : ${line.value}`)
				.filter((line) => /XResolution|YResolution|ResolutionUnit/.test(line));
			expect(overwriteResolution.sort()).toEqual(
				[
					"IFD0:XResolution : 300",
					"IFD0:YResolution : 300",
					"IFD0:ResolutionUnit : 2",
				].sort(),
			);
			expect(seededTagKeys(overwriteLines)).toEqual([]);

			// ExifTool route: Save-as-copy with Preserve resolution on (ADP-02). WebP does
			// not preserve resolution natively (D-01/D-03), so this launch routes the copy
			// through ExifTool exactly like overwrite mode above -- the 4.4.0 native-route
			// resolution loss (D-33) no longer applies once Preserve resolution is on.
			const launchedCopyOn = await launchApp({
				settings: { saveAsCopy: true, preserveResolution: true },
			});
			app = launchedCopyOn.app;
			window = launchedCopyOn.window;
			const copyOnDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await copyOnDriver.submitFiles([copyPath]);
			await copyOnDriver.waitForTerminal();
			await closeApp(app);
			app = undefined;

			const copyOut = path.join(dir, "copy_cleaned.webp");
			expect(fs.existsSync(copyOut)).toBe(true);
			const copyLines = readRawTagLines(copyOut, EXIFTOOL_PATH);
			const copyResolution = copyLines
				.filter((line) => line.key.startsWith("IFD0:"))
				.map((line) => `${line.key} : ${line.value}`)
				.filter((line) => /XResolution|YResolution|ResolutionUnit/.test(line));
			expect(copyResolution.sort()).toEqual(
				[
					"IFD0:XResolution : 300",
					"IFD0:YResolution : 300",
					"IFD0:ResolutionUnit : 2",
				].sort(),
			);
			expect(seededTagKeys(copyLines)).toEqual([]);
		} finally {
			cleanup();
		}
	});

	test("WebP Save-as-copy with Preserve resolution off still drops resolution (native route)", async () => {
		const { dir, cleanup } = createFixtureDir();
		try {
			const sourcePath = path.join(dir, "source.webp");
			fs.copyFileSync(
				path.resolve(__dirname, "fixtures/sample.webp"),
				sourcePath,
			);
			const { execFileSync } = await import("node:child_process");
			execFileSync(EXIFTOOL_PATH, [
				"-overwrite_original",
				"-IFD0:XResolution=300",
				"-IFD0:YResolution=300",
				"-IFD0:ResolutionUnit=inches",
				"-GPSLatitude=37.7749",
				"-GPSLatitudeRef=N",
				"-GPSLongitude=-122.4194",
				"-GPSLongitudeRef=W",
				"-Artist=ZZP52-ARTIST",
				"-Software=ZZP52-SOFT",
				"-Comment=ZZP52-COMMENT",
				sourcePath,
			]);

			// Native route: Save-as-copy with Preserve resolution off (D-01/D-03 gate
			// bypassed, so WebP is native-eligible again).
			const launchedCopyOff = await launchApp({
				settings: { saveAsCopy: true, preserveResolution: false },
			});
			app = launchedCopyOff.app;
			window = launchedCopyOff.window;
			const copyOffDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await copyOffDriver.submitFiles([sourcePath]);
			await copyOffDriver.waitForTerminal();
			await closeApp(app);
			app = undefined;

			const cleanedOut = path.join(dir, "source_cleaned.webp");
			expect(fs.existsSync(cleanedOut)).toBe(true);
			const cleanedLines = readRawTagLines(cleanedOut, EXIFTOOL_PATH);
			// D-33 measured: the native route preserves Orientation (an IFD0 tag, kept
			// because preserveOrientation is true independent of this feature) but drops
			// the entire rest of the EXIF chunk -- XResolution/YResolution/ResolutionUnit
			// included -- when Preserve resolution is off. Assert the resolution tags
			// specifically, not the whole IFD0 group, since Orientation surviving is
			// correct, unrelated behavior.
			expect(
				cleanedLines.some((line) =>
					/^IFD0:(XResolution|YResolution|ResolutionUnit)$/.test(line.key),
				),
			).toBe(false);
			expect(seededTagKeys(cleanedLines)).toEqual([]);
		} finally {
			cleanup();
		}
	});
});
