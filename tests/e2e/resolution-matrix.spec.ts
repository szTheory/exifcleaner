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

				if (row.ext === ".webp") {
					// D-33: WebP with the default Save-as-copy launch routes native
					// regardless of preserveResolution (isNativeCopyCandidate never
					// consults it) -- ON and OFF are therefore byte-identical, and both
					// lose the seeded IFD0 resolution. Measured, not assumed; see Test 2
					// for the ExifTool-route counterpart.
					expect(onLines).toEqual(offLines);
					continue;
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

	test("WebP keeps its IFD0 resolution through ExifTool (overwrite mode) and loses it on the native Save-as-copy route (D-33)", async () => {
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
			const nativePath = path.join(dir, "native.webp");
			fs.copyFileSync(overwritePath, nativePath);

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

			// Native route: Save-as-copy mode (default true).
			const launchedNative = await launchApp({
				settings: { saveAsCopy: true },
			});
			app = launchedNative.app;
			window = launchedNative.window;
			const nativeDriver = createProcessingDriver({
				app,
				window,
				exiftoolPath: EXIFTOOL_PATH,
			});
			await nativeDriver.submitFiles([nativePath]);
			await nativeDriver.waitForTerminal();
			await closeApp(app);
			app = undefined;

			const nativeOut = path.join(dir, "native_cleaned.webp");
			expect(fs.existsSync(nativeOut)).toBe(true);
			const nativeLines = readRawTagLines(nativeOut, EXIFTOOL_PATH);
			// D-33 measured: the native route preserves Orientation (an IFD0 tag, kept
			// because preserveOrientation is true independent of this feature) but drops
			// the entire rest of the EXIF chunk -- XResolution/YResolution/ResolutionUnit
			// included, regardless of preserveResolution (isNativeCopyCandidate never
			// consults it). Assert the resolution tags specifically, not the whole IFD0
			// group, since Orientation surviving is correct, unrelated behavior.
			expect(
				nativeLines.some((line) =>
					/^IFD0:(XResolution|YResolution|ResolutionUnit)$/.test(line.key),
				),
			).toBe(false);
			expect(seededTagKeys(nativeLines)).toEqual([]);
		} finally {
			cleanup();
		}
	});
});
