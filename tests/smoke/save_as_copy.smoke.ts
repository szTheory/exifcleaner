import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createProcessingDriver } from "../helpers/processing_driver";
import {
	closePackagedApp,
	launchPackagedApp,
	type PackagedLaunchContext,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

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
		const before = snapshotDir(dir);
		await driver.submitFiles([original]);
		await driver.waitForTerminal({ timeout: 60000 });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["sample_cleaned_2.jpg"],
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
