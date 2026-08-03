import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { fileURLToPath } from "node:url";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Folder Recursion", () => {
	let app: ElectronApplication;
	let page: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp({ settings: { saveAsCopy: false } });
		app = launched.app;
		page = launched.window;

		page.on("console", (msg) => {
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

	test("reports one skipped unsupported file and processes supported files from a nested folder", async () => {
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
			fs.writeFileSync(
				path.join(vacationDir, "unsupported.txt"),
				"not supported",
			);

			// Snapshot the temp root (not a leaf directory) so the recursive walk
			// observes the whole tree -- a format handler that quietly wrote into
			// photos/ instead of photos/vacation/ would otherwise be invisible.
			const before = snapshotDir(tempRoot);

			// Send the folder root through the production intake event. The renderer
			// must expand it through validated IPC rather than receiving pre-expanded
			// paths from this test.
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[photosDir],
			);

			const visibleToasts = page.locator(".toast--visible");
			await expect(visibleToasts).toHaveCount(1);
			await expect(visibleToasts).toContainText("1 unsupported files skipped");

			await waitForProcessing(page, { timeout: 15000, expectedFiles: 2 });

			const after = snapshotDir(tempRoot);

			// Both nested files are stripped in place; the directories themselves
			// (created before this test's baseline) are named unchanged so the
			// nested structure itself, not just the leaf files, is asserted.
			assertDirEffect(before, after, {
				modified: ["photos/vacation/sample.jpg", "photos/sample.png"],
				added: [],
				removed: [],
				unchanged: [
					"photos",
					"photos/vacation",
					"photos/vacation/unsupported.txt",
				],
			});

			// Verify 2 file rows appear
			const dataRows = page.locator(".file-table__row");
			await expect(dataRows).toHaveCount(2);

			// Verify files are processed on disk
			await assertMetadataStripped(path.join(vacationDir, "sample.jpg"));
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

			// folder:expand is a read: it must not write. Snapshotting the temp
			// root around this call is the nested case's read-only counterpart to
			// the write-path retrofit above -- a byte touched here would otherwise
			// be invisible, since this test never inspects file contents.
			const before = snapshotDir(tempRoot);

			// Use folder:expand via the renderer's window.api
			const expandResult = await page.evaluate(
				(rootDir) => window.api.folder.expand(rootDir),
				level1,
			);

			const after = snapshotDir(tempRoot);

			assertDirEffect(before, after, {
				unchanged: [
					"level1",
					"level1/level2",
					"level1/top.jpg",
					"level1/level2/deep.png",
				],
				added: [],
				modified: [],
				removed: [],
			});

			// Verify both files are discovered (flat list, full paths)
			expect(expandResult.files.length).toBe(2);

			const filenames = expandResult.files.map(
				(f: string) => f.split("/").pop() || f.split("\\").pop() || f,
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
