import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Folder Recursion", () => {
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

	test("processes files from a nested folder structure via folder:expand IPC", async () => {
		// Create a nested temporary directory with fixture files
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "exifcleaner-folder-e2e-"),
		);
		const fixturesDir = path.resolve(__dirname, "fixtures");

		try {
			// Create nested structure:
			// tempRoot/photos/
			//   vacation/
			//     sample.jpg
			//   sample.png
			const photosDir = path.join(tempRoot, "photos");
			const vacationDir = path.join(photosDir, "vacation");
			fs.mkdirSync(vacationDir, { recursive: true });

			fs.copyFileSync(
				path.join(fixturesDir, "sample.jpg"),
				path.join(vacationDir, "sample.jpg"),
			);
			fs.copyFileSync(
				path.join(fixturesDir, "sample.png"),
				path.join(photosDir, "sample.png"),
			);

			// Use folder:expand IPC via the renderer's window.api
			const expandResult = await window.evaluate(
				(rootDir) => window.api.folder.expand(rootDir),
				photosDir,
			);

			// Verify folder expansion found both files
			expect(expandResult.files).toBeDefined();
			expect(expandResult.files.length).toBe(2);

			// Now send the discovered files via IPC for processing
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				expandResult.files,
			);

			await waitForProcessing(window, { timeout: 15000 });

			// Verify 2 file rows appear
			const dataRows = window.locator(".file-table__row");
			await expect(dataRows).toHaveCount(2);

			// Verify files are processed on disk
			await assertMetadataStripped(
				path.join(vacationDir, "sample.jpg"),
			);
			await assertMetadataStripped(path.join(photosDir, "sample.png"));
		} finally {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	test("folder:expand returns flat file paths from nested directories", async () => {
		// Create a nested directory structure
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "exifcleaner-folder-e2e-"),
		);
		const fixturesDir = path.resolve(__dirname, "fixtures");

		try {
			const level1 = path.join(tempRoot, "level1");
			const level2 = path.join(level1, "level2");
			fs.mkdirSync(level2, { recursive: true });

			// Place files at different levels
			fs.copyFileSync(
				path.join(fixturesDir, "sample.jpg"),
				path.join(level1, "top.jpg"),
			);
			fs.copyFileSync(
				path.join(fixturesDir, "sample.png"),
				path.join(level2, "deep.png"),
			);

			// Use folder:expand via the renderer's window.api
			const expandResult = await window.evaluate(
				(rootDir) => window.api.folder.expand(rootDir),
				level1,
			);

			// Verify both files are discovered (flat list, full paths)
			expect(expandResult.files.length).toBe(2);

			const filenames = expandResult.files.map((f: string) =>
				f.split("/").pop() || f.split("\\").pop() || f,
			);
			expect(filenames).toContain("top.jpg");
			expect(filenames).toContain("deep.png");

			// Verify the deep file path contains the nested directory
			const deepFile = expandResult.files.find((f: string) =>
				f.includes("deep.png"),
			);
			expect(deepFile).toBeDefined();
			expect(deepFile).toContain("level2");
		} finally {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});
