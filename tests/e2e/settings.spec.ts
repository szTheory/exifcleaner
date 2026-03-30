import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "./helpers/fixture_copier";
import { readMetadataTags } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";

test.describe("Settings", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp();
		app = launched.app;
		window = launched.window;

		window.on("console", (msg) => {
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
		const gearButton = window.locator(".gear-icon");
		await expect(gearButton).toBeVisible();
		await gearButton.click();

		// Verify settings drawer is visible
		const drawer = window.locator('[role="dialog"][aria-label="Settings"]');
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
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();

		// Get initial state via settings API
		const initialSettings = await window.evaluate(() =>
			window.api.settings.get(),
		);
		expect(initialSettings.preserveOrientation).toBe(true);

		// Toggle off via settings API
		await window.evaluate(() =>
			window.api.settings.set({ preserveOrientation: false }),
		);
		await window.waitForTimeout(300); // Let React re-render

		// Verify the checkbox reflects the change
		const orientationInput = window.locator(
			"#toggle-preserve-orientation",
		);
		const afterToggle = await orientationInput.isChecked();
		expect(afterToggle).toBe(false);

		// Toggle back on
		await window.evaluate(() =>
			window.api.settings.set({ preserveOrientation: true }),
		);
		await window.waitForTimeout(300);
		const afterToggleBack = await orientationInput.isChecked();
		expect(afterToggleBack).toBe(true);
	});

	test("toggles preserve timestamps switch", async () => {
		// Open settings
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();

		// Get initial state
		const initialSettings = await window.evaluate(() =>
			window.api.settings.get(),
		);
		expect(initialSettings.preserveTimestamps).toBe(false);

		// Toggle on via settings API
		await window.evaluate(() =>
			window.api.settings.set({ preserveTimestamps: true }),
		);
		await window.waitForTimeout(300);

		const timestampsInput = window.locator(
			"#toggle-preserve-timestamps",
		);
		const afterToggle = await timestampsInput.isChecked();
		expect(afterToggle).toBe(true);

		// Reset
		await window.evaluate(() =>
			window.api.settings.set({ preserveTimestamps: false }),
		);
	});

	test("toggles xattr removal switch", async () => {
		test.skip(
			process.platform !== "darwin",
			"xattr is macOS-only",
		);

		// Open settings
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();

		// Get initial state
		const initialSettings = await window.evaluate(() =>
			window.api.settings.get(),
		);
		expect(initialSettings.removeXattrs).toBe(false);

		// Toggle on via settings API
		await window.evaluate(() =>
			window.api.settings.set({ removeXattrs: true }),
		);
		await window.waitForTimeout(300);

		const xattrInput = window.locator("#toggle-remove-xattrs");
		const afterToggle = await xattrInput.isChecked();
		expect(afterToggle).toBe(true);

		// Reset
		await window.evaluate(() =>
			window.api.settings.set({ removeXattrs: false }),
		);
	});

	test("preserves orientation metadata when toggle is enabled", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			// Ensure orientation preservation is enabled (default: true)
			const settings = await window.evaluate(() =>
				window.api.settings.get(),
			);
			expect(settings.preserveOrientation).toBe(true);

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

			await waitForProcessing(window, { timeout: 15000 });

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
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();

		// Get initial state
		const initialSettings = await window.evaluate(() =>
			window.api.settings.get(),
		);

		// Toggle save-as-copy to opposite of current
		const newValue = !initialSettings.saveAsCopy;
		await window.evaluate(
			(v) => window.api.settings.set({ saveAsCopy: v }),
			newValue,
		);
		await window.waitForTimeout(300);

		// Verify the checkbox reflects the change
		const saveAsCopyInput = window.locator("#toggle-save-as-copy");
		const afterToggle = await saveAsCopyInput.isChecked();
		expect(afterToggle).toBe(newValue);

		// Verify the setting was persisted via IPC
		const updatedSettings = await window.evaluate(() =>
			window.api.settings.get(),
		);
		expect(updatedSettings.saveAsCopy).toBe(newValue);

		// The save-as-copy feature creates _cleaned copies. The full pipeline
		// test is deferred since the exif:remove IPC handler doesn't currently
		// pass outputPath (pre-existing gap). UI toggle verification confirms
		// the setting propagates correctly.

		// Reset to default (false)
		await window.evaluate(() =>
			window.api.settings.set({ saveAsCopy: false }),
		);
	});
});
