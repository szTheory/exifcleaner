import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import {
	assertHasMetadata,
	assertMetadataStripped,
} from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	expectNoXattrs,
	expectSeededXattrs,
	seedXattrs,
} from "./helpers/xattr_assertions";

const SEEDED_XATTRS = [
	{ name: "com.apple.quarantine", valueHex: "303038313b" },
	{ name: "com.apple.metadata:kMDItemWhereFroms", valueHex: "706c616e" },
	{ name: "com.apple.metadata:_kMDItemUserTags", valueHex: "746167" },
];

if (process.platform === "darwin") {
	test.describe("macOS extended attributes", () => {
		let app: ElectronApplication;
		let window: Page;

		test.beforeEach(async () => {
			({ app, window } = await launchApp());
			await window.locator(".gear-icon").click();
			await window.evaluate(() =>
				globalThis.window.api.settings.set({ removeXattrs: true }),
			);
			await window.waitForTimeout(300);
			expect(await window.locator("#toggle-remove-xattrs").isChecked()).toBe(
				true,
			);
		});

		test.afterEach(async () => {
			if (app) await closeApp(app);
		});

		test("clears seeded attributes from a hostile filename after embedded metadata removal", async () => {
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const sentinelPath = path.join(dir, "xattr-hostile-sentinel");
				const basename = `foo"; touch ${sentinelPath}; echo ".jpg`;
				const filePath = path.join(dir, basename);
				fs.mkdirSync(path.dirname(filePath), { recursive: true });
				fs.renameSync(copyFixture("sample.jpg"), filePath);

				expect(fs.existsSync(sentinelPath)).toBe(false);
				await seedXattrs(filePath, SEEDED_XATTRS);
				await expectSeededXattrs(filePath, SEEDED_XATTRS);
				await assertHasMetadata(filePath, "Artist");
				const before = snapshotDir(dir);

				await app.evaluate(
					({ BrowserWindow }, paths) => {
						BrowserWindow.getAllWindows()[0]?.webContents.send(
							"file-open-add-files",
							paths,
						);
					},
					[filePath],
				);
				await waitForProcessing(window);

				await expect(window.locator(".file-table__row--complete")).toHaveCount(
					1,
				);
				assertDirEffect(before, snapshotDir(dir), { modified: [basename] });
				await assertMetadataStripped(filePath);
				await expectNoXattrs(filePath);
				expect(fs.existsSync(sentinelPath)).toBe(false);
			} finally {
				cleanup();
			}
		});
	});
}
