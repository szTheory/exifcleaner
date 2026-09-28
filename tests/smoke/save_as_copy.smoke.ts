import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions";
import { i18nLookup } from "../../src/domain/i18n/i18n_lookup";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createProcessingDriver } from "../helpers/processing_driver";
import {
	closePackagedApp,
	launchPackagedApp,
	type PackagedLaunchContext,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

// Residue directories are the library's own atomic-publication staging leftovers (see
// tests/e2e/file-type-coverage.spec.ts's identical residueEntries() comment, added in
// 58-09) -- discovered at runtime so this helper stays a no-op on platforms where
// disposal succeeds. 58-10: the same native-routing reconciliation the dev e2e suite
// already needed also applies here (smoke wasn't in 58-09's own scope).
function residueEntries(dir: string): string[] {
	return fs
		.readdirSync(dir)
		.filter((name) => name.startsWith(".exifcleaner-stage-"));
}

test("fresh packaged profiles default to Save as Copy", async () => {
	const context = await launchPackagedApp({ language: null });
	try {
		const settings = await context.window.evaluate(() =>
			window.api.settings.get(),
		);
		expect(settings.saveAsCopy).toBe(true);
		// The profile follows the system language, so the expected copy-mode
		// text is resolved at runtime from the locale and strings the installed
		// app itself reports, never hardcoded to one language.
		const { locale, strings } = await context.window.evaluate(async () => ({
			locale: await window.api.i18n.getLocale(),
			strings: await window.api.i18n.getStrings(),
		}));
		const copyText = i18nLookup({ strings, key: "intake.outputCopy", locale });
		const overwriteText = i18nLookup({
			strings,
			key: "intake.outputOverwrite",
			locale,
		});
		expect(copyText).not.toBe(overwriteText);
		await expect(
			context.window.locator(".empty-state__output-mode"),
		).toHaveText(copyText);
	} finally {
		await closePackagedApp(context);
	}
});

test("#304 save-as-copy preserves originals, resolves collisions, and reveals the copy", async () => {
	const context: PackagedLaunchContext = await launchPackagedApp();
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	try {
		expect(context.exiftoolPath.startsWith(context.resourcesPath)).toBe(true);
		expect(fs.existsSync(context.exiftoolPath)).toBe(true);
		const original = copyFixture("sample.jpg");
		const existingCopy = path.join(dir, "sample_cleaned.jpg");
		const collisionOutput = path.join(dir, "sample_cleaned_2.jpg");
		fs.copyFileSync(original, existingCopy);
		const reveal = await driver.interceptReveal();

		await driver.setSaveAsCopy(true);
		await driver.setPreserveResolution(false);
		const before = snapshotDir(dir);
		await driver.submitFiles([original]);
		await driver.waitForTerminal({ timeout: 60000 });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["sample_cleaned_2.jpg", ...residueEntries(dir)],
			unchanged: ["sample.jpg", "sample_cleaned.jpg"],
			modified: [],
			removed: [],
		});
		await assertMetadataStripped(collisionOutput, context.exiftoolPath);
		expect(await driver.terminalRowCounts()).toEqual({
			total: 1,
			complete: 1,
			error: 0,
		});
		expect(await driver.outputDisclosure()).not.toBe("");

		const revealButton = context.window.locator(".file-table__reveal").first();
		await revealButton.click();
		await revealButton.press("Enter");
		expect(await reveal.calls()).toEqual([collisionOutput, collisionOutput]);
		await reveal.restore();
	} finally {
		cleanup();
		await closePackagedApp(context);
	}

	expect(consoleErrors).toEqual([]);
});
