import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Accessibility", () => {
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

	test("traps focus within settings drawer when open", async () => {
		// Open settings drawer via gear button click
		const gearButton = page.locator(".gear-icon");
		await gearButton.click();

		// Verify settings drawer is open
		const drawer = page.locator('[role="dialog"]');
		await expect(drawer).toBeVisible();

		// Get all focusable elements inside the drawer
		const focusableCount = await page.evaluate(() => {
			const dialog = document.querySelector('[role="dialog"]');
			if (!dialog) return 0;
			const focusable = dialog.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			);
			return focusable.length;
		});
		expect(focusableCount).toBeGreaterThan(0);

		// Tab through all focusable elements plus one more (should wrap)
		const focusedElements: string[] = [];
		for (let i = 0; i < focusableCount + 2; i++) {
			await page.keyboard.press("Tab");
			const activeInfo = await page.evaluate(() => {
				const el = document.activeElement;
				if (!el) return "null";
				// Check if active element is inside the dialog
				const dialog = document.querySelector('[role="dialog"]');
				const isInsideDialog = dialog?.contains(el) ?? false;
				return isInsideDialog ? "inside" : "outside";
			});
			focusedElements.push(activeInfo);
		}

		// All focused elements should be inside the dialog (focus trap)
		const outsideCount = focusedElements.filter((e) => e === "outside").length;
		expect(outsideCount).toBe(0);

		// Press Escape to close the drawer
		await page.keyboard.press("Escape");

		// Verify drawer is closed
		await expect(drawer).toHaveCount(0);
	});
});
