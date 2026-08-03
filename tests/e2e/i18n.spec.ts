import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

test.describe("Internationalization", () => {
	let app: ElectronApplication;
	// Hazard: this Page-typed variable is named `window`, which shadows the DOM global
	// inside no-argument .evaluate() closures (TypeScript resolves lexically, not to
	// the in-page context). See settings.spec.ts for the fix if this file grows an
	// .evaluate(() => window....) call that needs type-checking.
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
		expect(titleText).toContain("Add files to clean");
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
		expect(englishText).toContain("Add files to clean");

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
		expect(frenchText).toContain("Ajoutez des fichiers");
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
		expect(japaneseText).not.toContain("Add files to clean");
	});

	test("switches to Romanian", async () => {
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "ro");

		const title = window.locator(".empty-state__title");
		await expect(title).toHaveText("Adaugă fișiere pentru curățare");
		await expect(
			window.getByRole("button", { name: "Alege fișiere…" }),
		).toBeVisible();
	});

	test("uses RTL direction, visual action order, and a localized count in Arabic", async () => {
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "ar");

		await expect(window.locator("html")).toHaveAttribute("dir", "rtl");
		const chooseFiles = window.getByRole("button", { name: "اختر ملفات…" });
		const chooseFolder = window.getByRole("button", { name: "اختر مجلدًا…" });
		const [filesBox, folderBox] = await Promise.all([
			chooseFiles.boundingBox(),
			chooseFolder.boundingBox(),
		]);
		expect(filesBox).not.toBeNull();
		expect(folderBox).not.toBeNull();
		expect(filesBox?.x).toBeGreaterThan(
			folderBox?.x ?? Number.POSITIVE_INFINITY,
		);

		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const unsupported = copyFixture("unsupported.txt");
			const before = snapshotDir(dir);
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[unsupported],
			);
			await expect(window.locator(".toast")).toContainText(
				"ملفات غير مدعومة تم تخطيها: 1",
			);
			assertDirEffect(before, snapshotDir(dir), {
				unchanged: ["unsupported.txt"],
				added: [],
				modified: [],
				removed: [],
			});
		} finally {
			cleanup();
		}
	});
});
