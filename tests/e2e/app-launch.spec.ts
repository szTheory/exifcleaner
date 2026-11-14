import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("App Launch", () => {
	let app: ElectronApplication;
	// Hazard: this Page-typed variable is named `window`, which shadows the DOM global
	// inside no-argument .evaluate() closures (TypeScript resolves lexically, not to
	// the in-page context). See settings.spec.ts for the fix if this file grows an
	// .evaluate(() => window....) call that needs type-checking.
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
		expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
	});

	test("shows the main window on launch", async () => {
		const isVisible = await app.evaluate(async ({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (!win) return false;
			// Window uses show: false + ready-to-show — may not be visible yet on slow CI
			if (win.isVisible()) return true;
			return new Promise<boolean>((resolve) => {
				win.once("show", () => resolve(true));
				setTimeout(() => resolve(win.isVisible()), 5000);
			});
		});
		expect(isVisible).toBe(true);
	});

	test("displays ExifCleaner as the window title", async () => {
		const title = await window.title();
		expect(title).toBe("ExifCleaner");
	});

	test("keeps first-run content usable at 200% zoom", async () => {
		await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			win?.setSize(580, 337);
			win?.webContents.setZoomFactor(2);
		});

		await expect(window.locator(".empty-state__button--primary")).toBeVisible();
		const layout = await window.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone");
			const content = document.querySelector(".app__content");
			const status = document.querySelector(".status-bar");
			if (!dropZone || !content || !status) return null;
			return {
				canScroll: dropZone.scrollHeight > dropZone.clientHeight,
				contentBottom: content.getBoundingClientRect().bottom,
				statusTop: status.getBoundingClientRect().top,
			};
		});
		expect(layout).not.toBeNull();
		expect(layout?.canScroll).toBe(true);
		expect(layout?.statusTop).toBeGreaterThanOrEqual(
			layout?.contentBottom ?? 0,
		);
	});

	test("has DevTools closed on launch", async () => {
		const isDevToolsOpened = await app.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			return win?.webContents.isDevToolsOpened() ?? true;
		});
		expect(isDevToolsOpened).toBe(false);
	});
});
