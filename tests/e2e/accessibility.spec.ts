import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Accessibility", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeAll(async () => {
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

	test.afterAll(async () => {
		if (app) {
			await closeApp(app);
		}
	});

	test("supports keyboard tab navigation through interactive elements", async () => {
		// Start by focusing the body
		await window.evaluate(() => {
			(document.activeElement as HTMLElement)?.blur();
			document.body.focus();
		});

		// Press Tab multiple times and track which elements receive focus
		const focusedTags: string[] = [];
		for (let i = 0; i < 5; i++) {
			await window.keyboard.press("Tab");
			const tag = await window.evaluate(() => {
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
		const gearFocused = focusedTags.some((t) =>
			t.includes("Open settings"),
		);
		expect(gearFocused).toBe(true);
	});

	test("shows visible focus indicator on focused elements", async () => {
		// Reset focus
		await window.evaluate(() => {
			(document.activeElement as HTMLElement)?.blur();
			document.body.focus();
		});

		// Tab to the gear button (first interactive element)
		await window.keyboard.press("Tab");

		// Find the currently focused element and check for visible focus indicator
		const hasFocusIndicator = await window.evaluate(() => {
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
		const buttonCount = await window.evaluate(() => {
			const buttons = document.querySelectorAll("button");
			return buttons.length;
		});
		expect(buttonCount).toBeGreaterThan(0);

		// Verify the settings gear button has an accessible name
		const gearAccessibleName = await window.evaluate(() => {
			const gear = document.querySelector(".gear-icon");
			return gear?.getAttribute("aria-label") ?? null;
		});
		expect(gearAccessibleName).not.toBeNull();
		expect(gearAccessibleName).toContain("settings");

		// Verify main landmark role exists
		const mainRole = window.locator("[role='main']");
		await expect(mainRole).toBeVisible();

		// Verify the drop zone has an accessible label
		const dropZoneLabel = await window.evaluate(() => {
			const zone = document.querySelector(".drop-zone");
			return zone?.getAttribute("aria-label") ?? null;
		});
		expect(dropZoneLabel).not.toBeNull();
	});

	test("traps focus within settings drawer when open", async () => {
		// Open settings drawer via gear button click
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();

		// Verify settings drawer is open
		const drawer = window.locator('[role="dialog"][aria-label="Settings"]');
		await expect(drawer).toBeVisible();

		// Get all focusable elements inside the drawer
		const focusableCount = await window.evaluate(() => {
			const dialog = document.querySelector(
				'[role="dialog"][aria-label="Settings"]',
			);
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
			await window.keyboard.press("Tab");
			const activeInfo = await window.evaluate(() => {
				const el = document.activeElement;
				if (!el) return "null";
				// Check if active element is inside the dialog
				const dialog = document.querySelector(
					'[role="dialog"][aria-label="Settings"]',
				);
				const isInsideDialog = dialog?.contains(el) ?? false;
				return isInsideDialog ? "inside" : "outside";
			});
			focusedElements.push(activeInfo);
		}

		// All focused elements should be inside the dialog (focus trap)
		const outsideCount = focusedElements.filter(
			(e) => e === "outside",
		).length;
		expect(outsideCount).toBe(0);

		// Press Escape to close the drawer
		await window.keyboard.press("Escape");

		// Verify drawer is closed
		await expect(drawer).not.toHaveClass(/settings-drawer--open/);
	});
});
