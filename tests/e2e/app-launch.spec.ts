import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("App Launch", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp();
		app = launched.app;
		window = launched.window;

		// Capture console.error messages per D-31
		window.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		// Check console errors before closing
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes("ExifTool") && !msg.includes("ENOENT"),
		);
		// Close app first to avoid timeout if assertion fails
		if (app) {
			await closeApp(app);
		}
		expect(
			unexpectedErrors,
			"Unexpected console.error messages",
		).toEqual([]);
	});

	test("shows the main window on launch", async () => {
		const isVisible = await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			return win?.isVisible() ?? false;
		});
		expect(isVisible).toBe(true);
	});

	test("displays ExifCleaner as the window title", async () => {
		const title = await window.title();
		expect(title).toBe("ExifCleaner");
	});

	test("shows the empty drop zone state", async () => {
		// The empty state section should be visible with i18n-populated text
		const emptyState = window.locator("section.empty-state");
		await expect(emptyState).toBeVisible();

		// The title (h1) should have non-empty i18n text
		const title = emptyState.locator("h1");
		await expect(title).toBeVisible();
		const titleText = await title.textContent();
		expect(titleText).toBeTruthy();
		expect(titleText!.length).toBeGreaterThan(0);
	});

	test("has DevTools closed on launch", async () => {
		const isDevToolsOpened = await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			return win?.webContents.isDevToolsOpened() ?? true;
		});
		expect(isDevToolsOpened).toBe(false);
	});
});
