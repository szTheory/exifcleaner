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
	listXattrNames,
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
			await window
				.getByRole("dialog", { name: "Settings" })
				.getByRole("button", { name: "Close settings" })
				.click();
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

		test("keeps source xattrs while clearing only the collision-safe cleaned copy", async () => {
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const originalPath = copyFixture("sample.jpg");
				const occupiedCopyPath = path.join(dir, "sample_cleaned.jpg");
				const copyPath = path.join(dir, "sample_cleaned_2.jpg");
				fs.copyFileSync(originalPath, occupiedCopyPath);
				await seedXattrs(originalPath, SEEDED_XATTRS);
				const originalNames = await listXattrNames(originalPath);
				await expectSeededXattrs(originalPath, SEEDED_XATTRS);
				const before = snapshotDir(dir);

				await window.evaluate(() =>
					globalThis.window.api.settings.set({ saveAsCopy: true }),
				);
				await window.waitForTimeout(300);
				await app.evaluate(
					({ BrowserWindow }, paths) => {
						BrowserWindow.getAllWindows()[0]?.webContents.send(
							"file-open-add-files",
							paths,
						);
					},
					[originalPath],
				);
				await waitForProcessing(window);

				assertDirEffect(before, snapshotDir(dir), {
					added: ["sample_cleaned_2.jpg"],
					unchanged: ["sample.jpg", "sample_cleaned.jpg"],
				});
				expect(fs.existsSync(copyPath)).toBe(true);
				expect(await listXattrNames(originalPath)).toEqual(originalNames);
				await expectSeededXattrs(originalPath, SEEDED_XATTRS);
				await assertMetadataStripped(copyPath);
				await expectNoXattrs(copyPath);
			} finally {
				await window.evaluate(() =>
					globalThis.window.api.settings.set({ saveAsCopy: false }),
				);
				cleanup();
			}
		});

		test("shows a bounded xattr failure without stopping the next file", async () => {
			test.setTimeout(30000);
			const { copyFixtures, cleanup } = createFixtureDir();
			try {
				const [failedPath, completedPath] = copyFixtures([
					"sample.jpg",
					"sample.png",
				]);
				if (failedPath === undefined || completedPath === undefined) {
					throw new Error("Expected two fixture paths");
				}
				expect(
					await app.evaluate(({ app: electronApp }) => {
						return (
							electronApp as unknown as {
								listenerCount: (event: string) => number;
							}
						).listenerCount("exifcleaner:dev-xattr-failure-path");
					}),
				).toBe(1);
				await app.evaluate(({ app: electronApp }, markerPath) => {
					(
						electronApp as unknown as {
							emit: (event: string, value: string) => void;
						}
					).emit("exifcleaner:dev-xattr-failure-path", markerPath);
				}, failedPath);
				await app.evaluate(
					({ BrowserWindow }, paths) => {
						BrowserWindow.getAllWindows()[0]?.webContents.send(
							"file-open-add-files",
							paths,
						);
					},
					[failedPath, completedPath],
				);
				await waitForProcessing(window, { expectedFiles: 2 });

				await window
					.locator(".file-table__row", { hasText: "sample.jpg" })
					.click();
				const rowFacts = await window.evaluate(() => {
					const rows = [...document.querySelectorAll(".file-table__row")];
					const failedRow = rows.find((row) =>
						row.textContent?.includes("sample.jpg"),
					);
					const completedRow = rows.find((row) =>
						row.textContent?.includes("sample.png"),
					);
					return {
						failedClass: failedRow?.className,
						failedText: failedRow?.parentElement?.textContent,
						failedHasAfter:
							failedRow?.querySelector(".file-table__after-done") !== null,
						failedHasReveal:
							failedRow?.querySelector(".file-table__reveal") !== null,
						completedClass: completedRow?.className,
					};
				});
				expect(rowFacts.failedClass).toMatch(/file-table__row--error/);
				expect(rowFacts.failedText).toContain(
					"macOS extended attributes could not be cleared",
				);
				expect(rowFacts.failedText).toContain(failedPath);
				expect(rowFacts.failedHasAfter).toBe(false);
				expect(rowFacts.failedHasReveal).toBe(false);
				expect(fs.existsSync(failedPath)).toBe(true);
				await assertMetadataStripped(failedPath);
				expect(rowFacts.completedClass).toMatch(/file-table__row--complete/);
			} finally {
				cleanup();
			}
		});
	});
}
