import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Internationalization", () => {
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

	test("displays UI text in default language (English)", async () => {
		// First force English by sending language:changed IPC
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "en");
		await window.waitForTimeout(300);

		// The empty state title should contain the English string
		const title = window.locator(".empty-state__title");
		await expect(title).toBeVisible();
		const titleText = await title.textContent();
		// English: "No files selected" (from strings.json empty.title.en)
		expect(titleText).toContain("No files selected");
	});

	test("switches language via IPC and updates UI text", async () => {
		// Set to English first to have a known baseline
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "en");
		await window.waitForTimeout(300);

		// Verify English text
		const title = window.locator(".empty-state__title");
		await expect(title).toBeVisible();
		const englishText = await title.textContent();
		expect(englishText).toContain("No files selected");

		// Send language change via IPC to French
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "fr");

		// Wait for React re-render
		await window.waitForTimeout(300);

		// Verify the title now shows French text
		const frenchText = await title.textContent();
		// French: "Aucun fichier sélectionné" (from strings.json empty.title.fr)
		expect(frenchText).toContain("Aucun fichier");
		expect(frenchText).not.toBe(englishText);
	});

	test("switches to a non-Latin language", async () => {
		// Switch to Japanese
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "ja");

		// Wait for React re-render
		await window.waitForTimeout(300);

		// Verify the title now contains Japanese characters
		const title = window.locator(".empty-state__title");
		await expect(title).toBeVisible();
		const japaneseText = await title.textContent();
		// Japanese: "ファイルが選択されていません" (from strings.json empty.title.ja)
		expect(japaneseText).toContain("ファイル");
		// Verify it is not the English text
		expect(japaneseText).not.toContain("No files selected");
	});
});
