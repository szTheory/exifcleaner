import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { readMetadataTags } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";
test.describe("Settings", () => {
	let app: ElectronApplication;
	let page: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp();
		app = launched.app;
		page = launched.window;

		page.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes("ExifTool") && !msg.includes("ENOENT"),
		);
		if (app) {
			await closeApp(app);
		}
		expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
	});

	test("opens and closes the settings drawer", async () => {
		// Click the gear icon to open settings
		const gearButton = page.locator(".gear-icon");
		await expect(gearButton).toBeVisible();
		await gearButton.click();

		// Verify settings drawer is visible
		const drawer = page.locator('[role="dialog"][aria-label="Settings"]');
		await expect(drawer).toBeVisible();

		// Verify drawer has the Settings title
		const title = drawer.locator("h2");
		await expect(title).toHaveText("Settings");

		// Close via the close button
		const closeButton = drawer.locator('[aria-label="Close settings"]');
		await closeButton.click();

		// Verify drawer closes (no longer has --open class)
		await expect(drawer).not.toHaveClass(/settings-drawer--open/);
	});

	test("toggles preserve orientation switch", async () => {
		// Open settings
		const gearButton = page.locator(".gear-icon");
		await gearButton.click();

		// Get initial state via settings API
		const initialSettings = await page.evaluate(() =>
			window.api.settings.get(),
		);
		expect(initialSettings.preserveOrientation).toBe(true);

		// Toggle off via settings API
		await page.evaluate(() =>
			window.api.settings.set({ preserveOrientation: false }),
		);
		await page.waitForTimeout(300); // Let React re-render

		// Verify the checkbox reflects the change
		const orientationInput = page.locator("#toggle-preserve-orientation");
		const afterToggle = await orientationInput.isChecked();
		expect(afterToggle).toBe(false);

		// Toggle back on
		await page.evaluate(() =>
			window.api.settings.set({ preserveOrientation: true }),
		);
		await page.waitForTimeout(300);
		const afterToggleBack = await orientationInput.isChecked();
		expect(afterToggleBack).toBe(true);
	});

	test("toggles preserve timestamps switch", async () => {
		// Open settings
		const gearButton = page.locator(".gear-icon");
		await gearButton.click();

		// Get initial state
		const initialSettings = await page.evaluate(() =>
			window.api.settings.get(),
		);
		expect(initialSettings.preserveTimestamps).toBe(false);

		// Toggle on via settings API
		await page.evaluate(() =>
			window.api.settings.set({ preserveTimestamps: true }),
		);
		await page.waitForTimeout(300);

		const timestampsInput = page.locator("#toggle-preserve-timestamps");
		const afterToggle = await timestampsInput.isChecked();
		expect(afterToggle).toBe(true);

		// Reset
		await page.evaluate(() =>
			window.api.settings.set({ preserveTimestamps: false }),
		);
	});

	test("preserves orientation metadata when toggle is enabled", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const expectedOrientation = "Rotate 90 CW";
			const tempFile = copyFixture("orientation.jpg");
			const tagsBefore = await readMetadataTags(tempFile);
			expect(tagsBefore.Orientation).toBe(expectedOrientation);

			// Ensure orientation preservation is enabled (default: true)
			const settings = await page.evaluate(() => window.api.settings.get());
			expect(settings.preserveOrientation).toBe(true);
			const before = snapshotDir(dir);

			// Process the file
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(page, { timeout: 15000 });
			const after = snapshotDir(dir);
			assertDirEffect(before, after, { modified: ["orientation.jpg"] });

			const tagsAfter = await readMetadataTags(tempFile);
			expect(tagsAfter.Orientation).toBe(expectedOrientation);
		} finally {
			cleanup();
		}
	});

	test("toggles save-as-copy switch and verifies _cleaned setting propagation", async () => {
		// Open settings
		const gearButton = page.locator(".gear-icon");
		await gearButton.click();

		// Get initial state
		const initialSettings = await page.evaluate(() =>
			window.api.settings.get(),
		);

		// Toggle save-as-copy to opposite of current
		const newValue = !initialSettings.saveAsCopy;
		await page.evaluate(
			(v) => window.api.settings.set({ saveAsCopy: v }),
			newValue,
		);
		await page.waitForTimeout(300);

		// Verify the checkbox reflects the change
		const saveAsCopyInput = page.locator("#toggle-save-as-copy");
		const afterToggle = await saveAsCopyInput.isChecked();
		expect(afterToggle).toBe(newValue);

		// Verify the setting was persisted via IPC
		const updatedSettings = await page.evaluate(() =>
			window.api.settings.get(),
		);
		expect(updatedSettings.saveAsCopy).toBe(newValue);

		// The executable #304 marker below owns the full pipeline contract.
		// This test only verifies settings propagation.

		// Reset to default (false)
		await page.evaluate(() => window.api.settings.set({ saveAsCopy: false }));
	});

	test("#304 save-as-copy on: original survives, a cleaned copy appears", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			await page.evaluate(() => window.api.settings.set({ saveAsCopy: true }));
			await page.waitForTimeout(300);

			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(page, { timeout: 15000 });

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				added: ["sample_cleaned.jpg"],
				unchanged: ["sample.jpg"],
				modified: [],
				removed: [],
			});
		} finally {
			await page.evaluate(() => window.api.settings.set({ saveAsCopy: false }));
			cleanup();
		}
	});

	// Regression guard (D-05 test 3): this is NOT a #304 proof and must STAY GREEN after
	// Phase 21. Overwrite mode (save-as-copy off) is measured GREEN today because #304
	// collapses both settings onto the same code path and both modes produce
	// bit-identical output — do not reword this assertion if it ever goes red.
	test("#304 overwrite mode (not a #304 proof, stays green after the fix): save-as-copy off overwrites in place", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			await page.evaluate(() => window.api.settings.set({ saveAsCopy: false }));
			await page.waitForTimeout(300);

			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(page, { timeout: 15000 });

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
			});
		} finally {
			cleanup();
		}
	});

	test("#304 collision: save-as-copy writes _cleaned_2 and reveals that artifact", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");
			const preExistingCleaned = path.join(dir, "sample_cleaned.jpg");
			const collisionOutput = path.join(dir, "sample_cleaned_2.jpg");
			fs.copyFileSync(tempFile, preExistingCleaned);

			await page.evaluate(() => window.api.settings.set({ saveAsCopy: true }));
			await page.waitForTimeout(300);

			await app.evaluate(({ shell }) => {
				const calls: string[] = [];
				const originalShowItemInFolder = shell.showItemInFolder;
				Reflect.set(globalThis, "__issue304RevealCalls", calls);
				Reflect.set(globalThis, "__issue304RestoreReveal", () => {
					shell.showItemInFolder = originalShowItemInFolder;
				});
				shell.showItemInFolder = (filePath: string): void => {
					calls.push(filePath);
				};
			});

			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(page, { timeout: 15000 });

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: ["sample_cleaned_2.jpg"],
				unchanged: ["sample.jpg", "sample_cleaned.jpg"],
				modified: [],
				removed: [],
			});

			const expectedAfterCount = Object.keys(
				await readMetadataTags(collisionOutput),
			).length;
			const afterCell = page
				.locator(".file-table__row")
				.first()
				.locator(".file-table__cell")
				.nth(5);
			await expect(afterCell).toContainText(String(expectedAfterCount));

			const revealButton = page.locator(".file-table__reveal").first();
			await revealButton.click();
			await revealButton.press("Enter");

			const revealCalls = await app.evaluate(() => {
				return Reflect.get(globalThis, "__issue304RevealCalls") as string[];
			});
			expect(revealCalls).toEqual([collisionOutput, collisionOutput]);
			await app.evaluate(() => {
				const restore = Reflect.get(globalThis, "__issue304RestoreReveal") as
					| (() => void)
					| undefined;
				restore?.();
			});
		} finally {
			await page.evaluate(() => window.api.settings.set({ saveAsCopy: false }));
			cleanup();
		}
	});
});
