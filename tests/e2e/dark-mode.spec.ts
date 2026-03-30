import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Dark Mode", () => {
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

	test("activates dark mode via nativeTheme", async () => {
		// Switch to dark mode via Electron nativeTheme API
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});

		// Wait for theme change to propagate to renderer via IPC
		await window.waitForTimeout(500);

		// Verify the data-theme attribute on documentElement reflects dark mode
		// The ThemeContext listens for nativeTheme changes via IPC and sets data-theme
		const dataTheme = await window.evaluate(() =>
			document.documentElement.getAttribute("data-theme"),
		);
		expect(dataTheme).toBe("dark");

		// Verify nativeTheme reports dark colors
		const shouldUseDark = await app.evaluate(({ nativeTheme }) =>
			nativeTheme.shouldUseDarkColors,
		);
		expect(shouldUseDark).toBe(true);
	});

	test("renders all components correctly in dark mode", async () => {
		// Switch to dark mode
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});
		await window.waitForTimeout(500);

		// Verify the drop zone is still visible
		const dropZone = window.locator(".drop-zone");
		await expect(dropZone).toBeVisible();

		// Verify the gear button is still visible
		const gearButton = window.locator(".gear-icon");
		await expect(gearButton).toBeVisible();

		// Verify the empty state section is still visible
		const emptyState = window.locator("section.empty-state");
		await expect(emptyState).toBeVisible();

		// Verify no elements have zero opacity (rendering failure indicator)
		const hasZeroOpacity = await window.evaluate(() => {
			const elements = document.querySelectorAll("*");
			for (const el of elements) {
				const style = window.getComputedStyle(el);
				if (style.opacity === "0" && el.children.length > 0) {
					return true;
				}
			}
			return false;
		});
		expect(hasZeroOpacity).toBe(false);
	});

	test("switches back to light mode", async () => {
		// First switch to dark
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});
		await window.waitForTimeout(300);

		// Now switch back to light
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "light";
		});
		await window.waitForTimeout(500);

		// Verify prefers-color-scheme: dark no longer matches
		const isDarkMediaMatch = await window.evaluate(() =>
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		);
		expect(isDarkMediaMatch).toBe(false);

		// Verify data-theme attribute is light
		const dataTheme = await window.evaluate(() =>
			document.documentElement.getAttribute("data-theme"),
		);
		expect(dataTheme).toBe("light");
	});

	test("respects system theme setting", async () => {
		// Set to system theme (follows OS preference)
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "system";
		});
		await window.waitForTimeout(300);

		// Verify the app is still functional (window visible, no crash)
		const isVisible = await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			return win?.isVisible() ?? false;
		});
		expect(isVisible).toBe(true);

		// Verify the main content area is present
		const main = window.locator("[role='main']");
		await expect(main).toBeVisible();
	});
});
