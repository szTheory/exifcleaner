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

	test("supports keyboard tab navigation through interactive elements", async () => {
		// Start by focusing the body
		await page.evaluate(() => {
			(document.activeElement as HTMLElement)?.blur();
			document.body.focus();
		});

		// Press Tab multiple times and track which elements receive focus
		const focusedTags: string[] = [];
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press("Tab");
			const tag = await page.evaluate(() => {
				const el = document.activeElement;
				if (!el || el === document.body) return "body";
				return `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`;
			});
			focusedTags.push(tag);
		}

		// At least one non-body element should have received focus
		const nonBodyFocused = focusedTags.filter((t) => t !== "body");
		expect(nonBodyFocused.length).toBeGreaterThan(0);

		// The gear button (settings) should be in the tab order
		const gearFocused = focusedTags.some((t) => t.includes("Open settings"));
		expect(gearFocused).toBe(true);
	});

	test("uses file, folder, then settings focus order", async () => {
		const primary = page.locator(".empty-state__button--primary");
		await primary.focus();
		await expect(primary).toBeFocused();

		await page.keyboard.press("Tab");
		await expect(page.locator(".empty-state__button--secondary")).toBeFocused();

		await page.keyboard.press("Tab");
		await expect(page.locator(".gear-icon")).toBeFocused();
	});

	test("shows visible focus indicator on focused elements", async () => {
		// Reset focus
		await page.evaluate(() => {
			(document.activeElement as HTMLElement)?.blur();
			document.body.focus();
		});

		// Tab to the gear button (first interactive element)
		await page.keyboard.press("Tab");

		// Find the currently focused element and check for visible focus indicator
		const hasFocusIndicator = await page.evaluate(() => {
			const el = document.activeElement;
			if (!el || el === document.body) return false;
			const style = window.getComputedStyle(el);
			// Check for outline or box-shadow (common focus indicators)
			const hasOutline =
				style.outlineStyle !== "none" && style.outlineWidth !== "0px";
			const hasBoxShadow = style.boxShadow !== "none";
			return hasOutline || hasBoxShadow;
		});

		expect(hasFocusIndicator).toBe(true);
	});

	test("has ARIA roles on interactive elements", async () => {
		// Verify buttons exist (native <button> elements have implicit button role)
		const buttonCount = await page.evaluate(() => {
			const buttons = document.querySelectorAll("button");
			return buttons.length;
		});
		expect(buttonCount).toBeGreaterThan(0);

		// Verify the settings gear button has an accessible name
		const gearAccessibleName = await page.evaluate(() => {
			const gear = document.querySelector(".gear-icon");
			return gear?.getAttribute("aria-label") ?? null;
		});
		expect(gearAccessibleName).not.toBeNull();
		expect(gearAccessibleName).toContain("settings");

		// Verify main landmark role exists
		const mainRole = page.locator("[role='main']");
		await expect(mainRole).toBeVisible();

		// Verify the drop zone has an accessible label
		const dropZoneLabel = await page.evaluate(() => {
			const zone = document.querySelector(".drop-zone");
			return zone?.getAttribute("aria-label") ?? null;
		});
		expect(dropZoneLabel).not.toBeNull();
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
