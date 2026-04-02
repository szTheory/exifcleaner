import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "./helpers/fixture_copier";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";

test.describe("File Processing", () => {
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

	test("strips EXIF metadata from a single JPEG file", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			// Send file via IPC (same channel as File > Open / drag-drop)
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			// Wait for processing to complete
			await waitForProcessing(window);

			// Verify file row appears in UI
			const rows = window.locator('[role="row"]');
			// Header row + at least 1 data row
			await expect(rows.first()).toBeVisible();

			// Verify metadata stripped on disk
			await assertMetadataStripped(tempFile);
		} finally {
			cleanup();
		}
	});

	test("processes a batch of 3 mixed file types", async () => {
		const { copyFixtures, cleanup } = createFixtureDir();
		try {
			// Use file types proven reliable across macOS, Windows, and Linux CI:
			// JPEG (standard image), PNG (lossless), MP4 (video container)
			const tempFiles = copyFixtures([
				"sample.jpg",
				"sample.png",
				"sample.mp4",
			]);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				tempFiles,
			);

			await waitForProcessing(window, {
				timeout: 30000,
				expectedFiles: 3,
			});

			// Verify all 3 file rows visible
			const dataRows = window.locator(".file-table__row");
			await expect(dataRows).toHaveCount(3);

			// Verify status bar shows completion info
			const statusBar = window.locator("footer.status-bar");
			await expect(statusBar).toBeVisible();

			// Verify all rows show completion (auto-retrying assertion)
			const completeRows = window.locator(
				".file-table__row--complete",
			);
			await expect(completeRows).toHaveCount(3, { timeout: 10000 });

			// Verify metadata stripped from all files on disk
			for (const tempFile of tempFiles) {
				await assertMetadataStripped(tempFile);
			}
		} finally {
			cleanup();
		}
	});

	test("shows type pills during processing", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(window);

			// Verify type pill is visible (TypePill renders the extension)
			const typePill = window.locator(".type-pill");
			await expect(typePill.first()).toBeVisible();
			const pillText = await typePill.first().textContent();
			expect(pillText?.toLowerCase()).toContain("jpg");
		} finally {
			cleanup();
		}
	});

	test("updates the status bar with file count", async () => {
		const { copyFixtures, cleanup } = createFixtureDir();
		try {
			const tempFiles = copyFixtures([
				"sample.jpg",
				"sample.png",
				"sample.pdf",
			]);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				tempFiles,
			);

			await waitForProcessing(window);

			// Status bar should show summary with the count
			const statusSummary = window.locator(".status-bar__summary");
			await expect(statusSummary).toBeVisible();
			const summaryText = await statusSummary.textContent();
			expect(summaryText).toContain("3");
		} finally {
			cleanup();
		}
	});

	test("supports Clean more cycle", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			// First cycle: process a file
			const tempFile1 = copyFixture("sample.jpg");

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile1],
			);

			await waitForProcessing(window);

			// Click the Clear button (StatusBar renders it)
			const clearButton = window.locator(".status-bar__button");
			await expect(clearButton).toBeVisible();
			await clearButton.click();

			// Verify empty state returns
			const emptyState = window.locator("section.empty-state");
			await expect(emptyState).toBeVisible();

			// Second cycle: process a new file
			const tempFile2 = copyFixture("sample.png");
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile2],
			);

			await waitForProcessing(window);

			// Verify processing worked again
			await assertMetadataStripped(tempFile2);
		} finally {
			cleanup();
		}
	});

	test("applies drag-over CSS class on dragenter", async () => {
		// Dispatch dragenter event on the drop zone
		await window.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone");
			if (dropZone) {
				const dragEvent = new DragEvent("dragover", {
					bubbles: true,
					cancelable: true,
					dataTransfer: new DataTransfer(),
				});
				dropZone.dispatchEvent(dragEvent);
			}
		});

		// Verify the drag-over active class is applied
		const activeDropZone = window.locator(".drop-zone--active");
		await expect(activeDropZone).toBeVisible();

		// Dispatch dragleave to remove it
		await window.evaluate(() => {
			const dropZone = document.querySelector(".drop-zone");
			if (dropZone) {
				const dragLeaveEvent = new DragEvent("dragleave", {
					bubbles: true,
					cancelable: true,
				});
				dropZone.dispatchEvent(dragLeaveEvent);
			}
		});

		// Verify the active class is removed
		await expect(activeDropZone).not.toBeVisible();
	});
});
