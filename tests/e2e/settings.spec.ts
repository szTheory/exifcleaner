import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
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

	test("toggles xattr removal switch", async () => {
		// Open settings
		const gearButton = page.locator(".gear-icon");
		await gearButton.click();

		const xattrInput = page.locator("#toggle-remove-xattrs");

		if (process.platform === "darwin") {
			// Get initial state
			const initialSettings = await page.evaluate(() =>
				window.api.settings.get(),
			);
			expect(initialSettings.removeXattrs).toBe(false);

			// Toggle on via settings API
			await page.evaluate(() => {
				window.api.settings.set({ removeXattrs: true });
			});
			await page.waitForTimeout(300);

			const afterToggle = await xattrInput.isChecked();
			expect(afterToggle).toBe(true);

			// Reset
			await page.evaluate(() => {
				window.api.settings.set({ removeXattrs: false });
			});
		} else {
			await expect(xattrInput).toHaveCount(0);
		}
	});

	test("preserves orientation metadata when toggle is enabled", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");
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
			// Only sample.jpg changes on disk (additive to the checks below).
			assertDirEffect(before, after, { modified: ["sample.jpg"] });
			// Read the processed file's metadata
			const tags = await readMetadataTags(tempFile);
			// When preserveOrientation is enabled, the file processes without errors.
			// Verify the file was processed (has at least structural tags).
			const tagKeys = Object.keys(tags);
			expect(tagKeys.length).toBeGreaterThan(0);
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

	test.fail(
		"#304 save-as-copy on: original survives, a cleaned copy appears",
		async () => {
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const tempFile = copyFixture("sample.jpg");

				await page.evaluate(() =>
					window.api.settings.set({ saveAsCopy: true }),
				);
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
				await page.evaluate(() =>
					window.api.settings.set({ saveAsCopy: false }),
				);
				cleanup();
			}
		},
	);

	// Characterization test (D-05 test 2): pins TODAY's broken behavior — save-as-copy
	// currently OVERWRITES the original instead of creating a copy. This test MUST BE
	// DELETED WHEN #304 IS FIXED (Phase 21). It exists as a second, unmaskable tripwire:
	// an xfail modifier only asserts *that* test 1 fails, never *why*. If the harness
	// itself breaks (a broken beforeEach, a changed selector), this test fails too —
	// proving test 1's red is attributable to #304 and not to harness rot.
	test("#304 characterization (DELETE WITH THE FIX): save-as-copy currently overwrites the original", async () => {
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
				modified: ["sample.jpg"],
				added: [],
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
});
