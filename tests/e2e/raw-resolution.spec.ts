// Phase 52-05 (FID-04, D-35, D-36, D-37): the RAW negative control that had never been run.
// Seeds 300 dpi into scratch copies of the four RAW_CASES fixtures (RAW_RESOLUTION_SEED_ARGS,
// group-qualified -- a bare write lands in XMP-tiff on CR3), cleans them through the real IPC
// path with Preserve resolution ON and again with it OFF, and proves the copy-back adds nothing
// beyond the source's own resolution. RAW always forced-copies (exif_handlers.ts
// wasForcedCopy) -- no overwrite-mode describe block, matching raw-metadata-removal.spec.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { closeApp, launchApp } from "./helpers/app_launcher";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import {
	createProcessingDriver,
	runRafRefusalScenario,
} from "../helpers/processing_driver";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import {
	readRawTags,
	readRawTagLines,
	retainedIdentifyingKeys,
	decoderTagMismatches,
	readImageDataHash,
	findSentinelBytes,
	tagLineDifferential,
	RAW_CASES,
	RAW_SENTINELS,
} from "../helpers/raw_probe";
import {
	RAW_RESOLUTION_SEED_ARGS,
	seedFile,
	resolutionDeltaViolations,
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

// Group-qualified writes to -IFD0:* land under a bare IFD0: prefix on CR2/DNG/CR3, but under
// Doc1:IFD0: on RW2 -- its IFD0 lives in the embedded JpgFromRaw preview, per raw_probe.ts's
// -G3:1 reader (measured, this plan's <interfaces>).
function resolutionGroupPrefix(fixture: string): string {
	return fixture === "Panasonic.rw2" ? "Doc1:IFD0" : "IFD0";
}

function resolutionSeedExpect(fixture: string): Record<string, string> {
	const prefix = resolutionGroupPrefix(fixture);
	return {
		[`${prefix}:XResolution`]: "300",
		[`${prefix}:YResolution`]: "300",
		[`${prefix}:ResolutionUnit`]: "2",
	};
}

// A named helper with a `page` parameter, not an inline arrow, so the local `window: Page`
// variable in the describe block below never shadows the browser-global `window` referenced
// inside page.evaluate's callback (resolution-preservation.spec.ts precedent).
async function getPreserveResolutionSetting(page: Page): Promise<boolean> {
	return page.evaluate(async () => {
		const settings = await window.api.settings.get();
		return settings.preserveResolution;
	});
}

test.describe("RAW resolution negative control — real IPC path, forced copy (FID-04, D-35)", () => {
	let app: ElectronApplication | undefined;
	let window: Page;

	test.afterEach(async () => {
		if (app) await closeApp(app);
		app = undefined;
	});

	test("a seeded CR2, DNG, CR3 and RW2 cleaned with Preserve resolution on gain nothing the copy-back did not ask for (FID-04)", async () => {
		const onFixtures = createFixtureDir();
		const offFixtures = createFixtureDir();
		try {
			const onPaths = new Map<string, string>();
			const offPaths = new Map<string, string>();

			// Materialize and seed both dirs before either launch, verifying each on/off pair
			// stays byte-identical after seeding and that the source still carries every
			// claimed identifying key (non-vacuity) before any processing happens.
			for (const raw of RAW_CASES) {
				const onPath = onFixtures.copyFixture(raw.fixture);
				const offPath = offFixtures.copyFixture(raw.fixture);
				const expected = resolutionSeedExpect(raw.fixture);
				seedFile(onPath, EXIFTOOL_PATH, RAW_RESOLUTION_SEED_ARGS, expected);
				seedFile(offPath, EXIFTOOL_PATH, RAW_RESOLUTION_SEED_ARGS, expected);
				expect(sha256(onPath)).toBe(sha256(offPath));

				const sourceTags = readRawTags(onPath, EXIFTOOL_PATH, {
					numeric: true,
				});
				const sourceIdentifying = retainedIdentifyingKeys(sourceTags, []);
				for (const key of raw.sourceIdentifyingKeys) {
					expect(sourceIdentifying).toContain(key);
				}

				onPaths.set(raw.fixture, onPath);
				offPaths.set(raw.fixture, offPath);
			}

			const onOutputs = new Map<string, string>();
			for (const [fixture, filePath] of onPaths) {
				onOutputs.set(
					fixture,
					generateCleanedPath({ filePath, exists: fs.existsSync }),
				);
			}
			const offOutputs = new Map<string, string>();
			for (const [fixture, filePath] of offPaths) {
				offOutputs.set(
					fixture,
					generateCleanedPath({ filePath, exists: fs.existsSync }),
				);
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
				expectedFiles: RAW_CASES.length,
				timeout: 60000,
			});
			expect(await onDriver.terminalRowCounts()).toEqual({
				total: RAW_CASES.length,
				complete: RAW_CASES.length,
				error: 0,
			});
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
				expectedFiles: RAW_CASES.length,
				timeout: 60000,
			});
			expect(await offDriver.terminalRowCounts()).toEqual({
				total: RAW_CASES.length,
				complete: RAW_CASES.length,
				error: 0,
			});
			const offAfter = snapshotDir(offFixtures.dir);
			await closeApp(app);
			app = undefined;

			assertDirEffect(onBefore, onAfter, {
				added: [...onOutputs.values()].map((p) => path.basename(p)),
				modified: [],
				removed: [],
				unchanged: [...onPaths.values()].map((p) => path.basename(p)),
			});
			assertDirEffect(offBefore, offAfter, {
				added: [...offOutputs.values()].map((p) => path.basename(p)),
				modified: [],
				removed: [],
				unchanged: [...offPaths.values()].map((p) => path.basename(p)),
			});

			for (const raw of RAW_CASES) {
				const onSrc = onPaths.get(raw.fixture)!;
				const onOut = onOutputs.get(raw.fixture)!;
				const offOut = offOutputs.get(raw.fixture)!;
				const isRw2 = raw.fixture === "Panasonic.rw2";
				const prefix = resolutionGroupPrefix(raw.fixture);
				const companions = isRw2 ? ["IFD0:JpgFromRaw"] : [];

				const sourceLines = readRawTagLines(onSrc, EXIFTOOL_PATH);
				const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
				const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);

				const diff = tagLineDifferential(offLines, onLines);
				if (isRw2) {
					expect([...diff.added].sort()).toEqual(
						[
							"Doc1:IFD0:ResolutionUnit",
							"Doc1:IFD0:XResolution",
							"Doc1:IFD0:YResolution",
						].sort(),
					);
					expect(diff.removed).toEqual([]);
					expect(diff.changed.map((c) => c.key)).toEqual(["IFD0:JpgFromRaw"]);
				} else {
					expect(diff).toEqual({ removed: [], added: [], changed: [] });
				}

				expect(
					resolutionDeltaViolations({
						source: sourceLines,
						off: offLines,
						on: onLines,
						companions,
					}),
				).toEqual([]);

				const resolutionKeys = [
					`${prefix}:XResolution`,
					`${prefix}:YResolution`,
					`${prefix}:ResolutionUnit`,
				];
				const onResolutionLines = onLines
					.filter((line) => resolutionKeys.includes(line.key))
					.map((line) => `${line.key} : ${line.value}`)
					.sort();
				expect(onResolutionLines).toEqual(
					[
						`${prefix}:XResolution : 300`,
						`${prefix}:YResolution : 300`,
						`${prefix}:ResolutionUnit : 2`,
					].sort(),
				);

				const sourceTags = readRawTags(onSrc, EXIFTOOL_PATH, {
					numeric: true,
				});
				const onTags = readRawTags(onOut, EXIFTOOL_PATH, { numeric: true });
				expect(retainedIdentifyingKeys(onTags, raw.residueAllowlist)).toEqual(
					[],
				);
				expect(
					decoderTagMismatches(sourceTags, onTags, raw.decoderKeys),
				).toEqual([]);
				expect(readImageDataHash(onOut, EXIFTOOL_PATH)).toBe(raw.imageDataHash);
				expect(findSentinelBytes(onOut, RAW_SENTINELS)).toEqual([]);
			}
		} finally {
			onFixtures.cleanup();
			offFixtures.cleanup();
		}
	});

	test("RAF is still refused before any write with Preserve resolution on (D-37)", async () => {
		const launched = await launchApp();
		app = launched.app;
		window = launched.window;
		await runRafRefusalScenario({ app, window, exiftoolPath: EXIFTOOL_PATH });
		expect(await getPreserveResolutionSetting(window)).toBe(true);
	});
});
