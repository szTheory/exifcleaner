// Phase 69-15 (SMK-01, D-17, D-18): ONE launch of the installed app and one serial test that walks
// eight rows in a single fixture directory. Each row calls window.api.exif.removeMetadata, asserts
// the additive `evidence` field (engine, effective output mode, leak-check outcome), prints one
// stable line for the hosted job log,
//   SMOKE-ROW <row> engine=<e> mode=<m> leak=<l>
// and proves the whole-directory effect plus a re-read of the output with the bundled ExifTool.
// The row id is a fixed label, never a path or user data.
//
// The declined-HEIC control closes the loop: the installed app is shown to report `exiftool` for a
// file the native handler declines, and the native expectation assertion is shown to THROW, so a
// harness that cannot fail would be caught here.
//
// The title does not match the Intel job's --grep (ci.yml smoke-macos-intel), and the guard
// tests/smoke/helpers/intel_grep_isolation.test.ts keeps it that way.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	RemoveMetadataEvidence,
	RemoveMetadataResult,
} from "../../src/common/ipc_channels";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import { readMetadataTags } from "../e2e/helpers/metadata_assertions";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import { seedHeifCopy } from "../helpers/heif_seed";
import { assertSmokeRow, formatSmokeRow } from "../helpers/smoke_row";
import {
	closePackagedApp,
	launchPackagedApp,
} from "./helpers/packaged_launcher";
import type { PackagedLaunchContext } from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

const NATIVE_COPY_PASSED: RemoveMetadataEvidence = {
	engine: "native",
	outputMode: "copy",
	leakCheck: "passed",
};
const NATIVE_OVERWRITE_PASSED: RemoveMetadataEvidence = {
	engine: "native",
	outputMode: "overwrite",
	leakCheck: "passed",
};

// Ungrouped ExifTool names of the identifying tags each fixture carries (measured on the committed
// bytes; the HEIC/AVIF names are the 63-17 seed set).
const JPEG_REMOVED = [
	"Artist",
	"Copyright",
	"GPSLatitude",
	"GPSLongitude",
	"Make",
	"Model",
	"DateTimeOriginal",
];
const WEBP_REMOVED = ["Make", "Artist"];
const PNG_REMOVED = ["Author", "Copyright"];
const HEIF_REMOVED = [
	"Artist",
	"Copyright",
	"GPSLatitude",
	"GPSLongitude",
	"Make",
	"Model",
	"DateTimeOriginal",
	"Creator",
];

interface Row {
	/** Fixed label printed in the log; also the stem of the file in the fixture directory. */
	readonly id: string;
	readonly fixture: string;
	readonly extension: string;
	readonly seed: boolean;
	readonly mode: "copy" | "overwrite";
	readonly removed: readonly string[];
}

const ROWS: readonly Row[] = [
	{
		id: "default-webp-copy",
		fixture: "sample.webp",
		extension: "webp",
		seed: false,
		mode: "copy",
		removed: WEBP_REMOVED,
	},
	{
		id: "overwrite-jpg",
		fixture: "sample.jpg",
		extension: "jpg",
		seed: false,
		mode: "overwrite",
		removed: JPEG_REMOVED,
	},
	{
		id: "overwrite-jpeg",
		fixture: "sample.jpg",
		extension: "jpeg",
		seed: false,
		mode: "overwrite",
		removed: JPEG_REMOVED,
	},
	{
		id: "overwrite-png",
		fixture: "sample.png",
		extension: "png",
		seed: false,
		mode: "overwrite",
		removed: PNG_REMOVED,
	},
	{
		id: "overwrite-webp",
		fixture: "sample.webp",
		extension: "webp",
		seed: false,
		mode: "overwrite",
		removed: WEBP_REMOVED,
	},
	{
		id: "overwrite-heic",
		fixture: "sample-sips-icc.heic",
		extension: "heic",
		seed: true,
		mode: "overwrite",
		removed: HEIF_REMOVED,
	},
	{
		id: "overwrite-heif",
		fixture: "sample-sips-icc.heic",
		extension: "heif",
		seed: true,
		mode: "overwrite",
		removed: HEIF_REMOVED,
	},
	{
		id: "overwrite-avif",
		fixture: "sample-sips-icc.avif",
		extension: "avif",
		seed: true,
		mode: "overwrite",
		removed: HEIF_REMOVED,
	},
];

// Measured against exifcleaner-node 0.5.0 (69-15): both sample-sips-icc-declined.* are declined at
// admission (unsupported-format) under the shipped defaults; the HEIC is the control.
const DECLINED_CONTROL = {
	id: "control-declined-heic",
	fixture: "sample-sips-icc-declined.heic",
	extension: "heic",
} as const;

async function applyShippedDefaults(
	context: PackagedLaunchContext,
	saveAsCopy: boolean,
): Promise<void> {
	// language and theme are left alone (the launcher already pinned the language).
	const settings = {
		preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
		preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
		preserveResolution: DEFAULT_SETTINGS.preserveResolution,
		removeXattrs: DEFAULT_SETTINGS.removeXattrs,
		preserveTimestamps: DEFAULT_SETTINGS.preserveTimestamps,
		saveAsCopy,
	};
	const response = await context.window.evaluate(
		(next) => globalThis.window.api.settings.set(next),
		settings,
	);
	expect(response).toEqual({ success: true, error: null });
}

function removeMetadata(
	context: PackagedLaunchContext,
	filePath: string,
): Promise<RemoveMetadataResult> {
	return context.window.evaluate(
		(target) => globalThis.window.api.exif.removeMetadata(target),
		filePath,
	);
}

async function assertSeededTagsGone(
	context: PackagedLaunchContext,
	filePath: string,
	removed: readonly string[],
): Promise<void> {
	const tags = Object.keys(
		await readMetadataTags(filePath, context.exiftoolPath),
	);
	for (const name of removed) {
		expect(
			tags,
			`${name} must be gone from ${path.basename(filePath)}`,
		).not.toContain(name);
	}
}

test("installed artifact reports engine, output mode and leak check for every native image row", async () => {
	const context = await launchPackagedApp();
	const { dir, cleanup } = createFixtureDir();
	const fixturesDir = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"../e2e/fixtures",
	);
	const sentinel = path.join(dir, "sentinel.txt");
	fs.writeFileSync(sentinel, "untouched sibling");
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	const printed: string[] = [];

	try {
		const sentinelBytes = fs.readFileSync(sentinel);
		await applyShippedDefaults(context, true);

		for (const row of ROWS) {
			// Copy rows run first at saveAsCopy true; every later row is an overwrite.
			if (row.mode === "overwrite" && row.id === "overwrite-jpg") {
				await applyShippedDefaults(context, false);
			}
			const filePath = path.join(dir, `${row.id}.${row.extension}`);
			fs.copyFileSync(path.join(fixturesDir, row.fixture), filePath);
			if (row.seed) {
				seedHeifCopy({
					exiftoolPath: context.exiftoolPath,
					sourcePath: filePath,
				});
			}
			const sourceBytes = fs.readFileSync(filePath);
			const before = snapshotDir(dir);

			const result = await removeMetadata(context, filePath);
			const evidence = assertSmokeRow({
				file: row.id,
				result,
				expected:
					row.mode === "copy" ? NATIVE_COPY_PASSED : NATIVE_OVERWRITE_PASSED,
			});
			const line = formatSmokeRow(row.id, evidence);
			console.log(line);
			printed.push(line);
			await test.info().attach(`smoke-row-${row.id}`, {
				body: JSON.stringify({
					platform: process.platform,
					row: row.id,
					...evidence,
				}),
				contentType: "application/json",
			});

			const after = snapshotDir(dir);
			const others = [...before.keys()].filter(
				(name) => name !== path.basename(filePath),
			);
			if (row.mode === "copy") {
				// The app resolved its own cleaned name at write time; the directory delta names it.
				const added = [...after.keys()].filter((name) => !before.has(name));
				expect(added).toHaveLength(1);
				expect(result.success && path.basename(result.outputPath)).toBe(
					added[0],
				);
				expect(added[0]).not.toBe(path.basename(filePath));
				assertDirEffect(before, after, {
					added,
					modified: [],
					removed: [],
					unchanged: [...others, path.basename(filePath)],
				});
				expect(fs.readFileSync(filePath).equals(sourceBytes)).toBe(true);
				await assertSeededTagsGone(
					context,
					path.join(dir, added[0] ?? ""),
					row.removed,
				);
			} else {
				expect(result.success && result.outputPath).toBe(filePath);
				assertDirEffect(before, after, {
					added: [],
					modified: [path.basename(filePath)],
					removed: [],
					unchanged: others,
				});
				expect(fs.readFileSync(filePath).equals(sourceBytes)).toBe(false);
				await assertSeededTagsGone(context, filePath, row.removed);
			}
			expect(fs.readFileSync(sentinel).equals(sentinelBytes)).toBe(true);
		}

		// Control: a file the native handler declines is cleaned by ExifTool, and the harness is
		// shown to fail when it expects native for it.
		const controlPath = path.join(
			dir,
			`${DECLINED_CONTROL.id}.${DECLINED_CONTROL.extension}`,
		);
		fs.copyFileSync(
			path.join(fixturesDir, DECLINED_CONTROL.fixture),
			controlPath,
		);
		seedHeifCopy({
			exiftoolPath: context.exiftoolPath,
			sourcePath: controlPath,
		});
		const controlBefore = snapshotDir(dir);
		const controlResult = await removeMetadata(context, controlPath);
		expect(controlResult.success).toBe(true);
		const controlEvidence = controlResult.success
			? controlResult.evidence
			: undefined;
		expect(controlEvidence?.engine).toBe("exiftool");
		if (controlEvidence !== undefined) {
			const line = formatSmokeRow(DECLINED_CONTROL.id, controlEvidence);
			console.log(line);
			printed.push(line);
			await test.info().attach(`smoke-row-${DECLINED_CONTROL.id}`, {
				body: JSON.stringify({
					platform: process.platform,
					row: DECLINED_CONTROL.id,
					...controlEvidence,
				}),
				contentType: "application/json",
			});
		}
		expect(() =>
			assertSmokeRow({
				file: DECLINED_CONTROL.id,
				result: controlResult,
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/engine was exiftool, expected native/u);
		assertDirEffect(controlBefore, snapshotDir(dir), {
			added: [],
			modified: [path.basename(controlPath)],
			removed: [],
			unchanged: [path.basename(sentinel)],
		});

		expect(printed).toHaveLength(ROWS.length + 1);
	} finally {
		cleanup();
		await closePackagedApp(context);
	}

	expect(consoleErrors).toEqual([]);
});
