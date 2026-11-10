// Phase 69-02 (OVR-01; D-21, measurement M-08): a 3-component colour JPEG saved as a copy by the
// INSTALLED app must complete and verify on every OS. The committed colour fixtures
// (tests/e2e/fixtures/COLOR-PROVENANCE.md) carry synthetic identifying metadata, so the strip is
// non-vacuous. Each test prints one stable line per observation to stdout so the hosted job log
// (and the smoke-report artifact attachment) carries the measurement:
//   MEASURE: <platform> color-copy fixture=<name> flags=<off|default> status=<complete|error> ...
// This file is new on purpose: the Intel job greps three fixed titles, and none of the titles
// below matches that grep, so these tests do not run on Intel and cannot change its count.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
	assertMetadataStripped,
	readMetadataTags,
} from "../e2e/helpers/metadata_assertions";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createFixtureDir } from "../helpers/fixture_copier";
import { createProcessingDriver } from "../helpers/processing_driver";
import {
	closePackagedApp,
	launchPackagedApp,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

const COLOR_FIXTURES = ["color_420_progressive.jpg", "color_444.jpg"] as const;
const FLAG_SETS = ["off", "default"] as const;
type FlagSet = (typeof FLAG_SETS)[number];

// Ungrouped ExifTool names of the seeded identifying tags (COLOR-PROVENANCE.md).
const SEEDED_TAG_NAMES = [
	"Make",
	"Model",
	"Artist",
	"GPSLatitude",
	"GPSLongitude",
	"Creator",
] as const;

for (const fixture of COLOR_FIXTURES) {
	for (const flags of FLAG_SETS) {
		test(`colour JPEG ${fixture} saves as a copy and verifies in the installed artifact (flags ${flags})`, async () => {
			const context = await launchPackagedApp();
			const driver = createProcessingDriver(context);
			const { dir, copyFixture, cleanup } = createFixtureDir();
			const consoleErrors: string[] = [];
			context.window.on("console", (message) => {
				if (message.type() === "error") consoleErrors.push(message.text());
			});

			try {
				if (flags === "off") {
					await context.window.evaluate(() =>
						globalThis.window.api.settings.set({
							preserveColorProfile: false,
							preserveOrientation: false,
							preserveResolution: false,
						}),
					);
				}
				await driver.setSaveAsCopy(true);

				const source = copyFixture(fixture);
				const sourceBytes = fs.readFileSync(source);
				const outputPath = generateCleanedPath({
					filePath: source,
					exists: fs.existsSync,
				});
				const before = snapshotDir(dir);
				await driver.submitFiles([source]);
				await driver.waitForTerminal({ timeout: 60000 });
				const after = snapshotDir(dir);
				const counts = await driver.terminalRowCounts();

				if (counts.error > 0) {
					// A hosted failure must carry its own discriminating text.
					const errorRow = context.window.locator(".file-table__row--error");
					await errorRow.first().click();
					const detail = await context.window
						.locator(".file-table__error-text")
						.first()
						.innerText();
					console.log(
						`MEASURE: ${process.platform} color-copy fixture=${fixture} flags=${flags} status=error detail=${JSON.stringify(detail)}`,
					);
				}
				expect(counts).toEqual({ total: 1, complete: 1, error: 0 });
				console.log(
					`MEASURE: ${process.platform} color-copy fixture=${fixture} flags=${flags} status=complete`,
				);
				await test.info().attach(`color-copy-${fixture}-${flags}`, {
					body: JSON.stringify({
						platform: process.platform,
						fixture,
						flags,
						status: "complete",
					}),
					contentType: "application/json",
				});

				assertDirEffect(before, after, {
					modified: [],
					added: [path.basename(outputPath)],
					removed: [],
					unchanged: [fixture],
				});
				expect(fs.readFileSync(source).equals(sourceBytes)).toBe(true);
				await assertMetadataStripped(outputPath, context.exiftoolPath);
				const outputTags = Object.keys(
					await readMetadataTags(outputPath, context.exiftoolPath),
				);
				for (const name of SEEDED_TAG_NAMES) {
					expect(outputTags, `${name} must be gone`).not.toContain(name);
				}
			} finally {
				cleanup();
				await closePackagedApp(context);
			}

			expect(consoleErrors).toEqual([]);
		});
	}
}
