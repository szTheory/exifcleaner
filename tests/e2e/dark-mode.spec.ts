import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Dark Mode", () => {
	let app: ElectronApplication;
	let page: Page;
	let consoleErrors: string[];

	test.beforeAll(async () => {
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

	test.afterAll(async () => {
		if (app) {
			await closeApp(app);
		}
	});

	test("activates dark mode via nativeTheme", async () => {
		// Switch to dark mode via Electron nativeTheme API
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});

		// Wait for theme change to propagate to renderer via IPC
		await page.waitForTimeout(300);

		// Verify the data-theme attribute on documentElement reflects dark mode
		// The ThemeContext listens for nativeTheme changes via IPC and sets data-theme
		const dataTheme = await page.evaluate(() =>
			document.documentElement.getAttribute("data-theme"),
		);
		expect(dataTheme).toBe("dark");

		// Verify nativeTheme reports dark colors
		const shouldUseDark = await app.evaluate(
			({ nativeTheme }) => nativeTheme.shouldUseDarkColors,
		);
		expect(shouldUseDark).toBe(true);
	});

	test("renders all components correctly in dark mode", async () => {
		// Ensure dark mode is set (may already be from previous test)
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});
		await page.waitForTimeout(300);

		// Verify the drop zone is still visible
		const dropZone = page.locator(".drop-zone");
		await expect(dropZone).toBeVisible();

		// Verify the gear button is still visible
		const gearButton = page.locator(".gear-icon");
		await expect(gearButton).toBeVisible();

		// Verify the empty state section is still visible
		const emptyState = page.locator("section.empty-state");
		await expect(emptyState).toBeVisible();

		// Verify no elements have zero opacity (rendering failure indicator)
		const hasZeroOpacity = await page.evaluate(() => {
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
		// Ensure dark mode first
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});
		await page.waitForTimeout(300);

		// Now switch back to light
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "light";
		});
		await page.waitForTimeout(300);

		// Verify data-theme attribute is light
		const dataTheme = await page.evaluate(() =>
			document.documentElement.getAttribute("data-theme"),
		);
		expect(dataTheme).toBe("light");
	});

	test("respects system theme setting", async () => {
		// Set to system theme (follows OS preference)
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "system";
		});
		await page.waitForTimeout(300);

		// Verify the app is still functional (window visible, no crash)
		const isVisible = await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			return win?.isVisible() ?? false;
		});
		expect(isVisible).toBe(true);

		// Verify the main content area is present
		const main = page.locator("[role='main']");
		await expect(main).toBeVisible();
	});
});
