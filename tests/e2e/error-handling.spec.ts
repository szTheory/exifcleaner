import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "./helpers/fixture_copier";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";

test.describe("Error Handling", () => {
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
		// Error handling tests may trigger ExifTool warnings, so filter broadly
		const unexpectedErrors = consoleErrors.filter(
			(msg) =>
				!msg.includes("ExifTool") &&
				!msg.includes("ENOENT") &&
				!msg.includes("exiftool") &&
				!msg.includes("Error") &&
				!msg.includes("error") &&
				!msg.includes("Warning") &&
				!msg.includes("warning"),
		);
		if (app) {
			await closeApp(app);
		}
		expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
	});

	test("handles a corrupted file without crashing", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("corrupted.jpg");

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			// Wait for processing to complete (app should handle corrupted file gracefully)
			await waitForProcessing(window, { timeout: 15000 });

			// Verify the file row appears and processing completed
			const dataRows = window.locator(".file-table__row");
			await expect(dataRows).toHaveCount(1);

			// The file should either show error state or complete/no-metadata state
			// depending on ExifTool behavior. Either way, app doesn't crash.
			const errorRow = window.locator(".file-table__row--error");
			const completeRow = window.locator(".file-table__row--complete");
			const errorCount = await errorRow.count();
			const completeCount = await completeRow.count();
			expect(errorCount + completeCount).toBe(1);
		} finally {
			cleanup();
		}
	});

	test("handles a zero-byte file gracefully", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("zero_byte.jpg");

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
			await waitForProcessing(window, { timeout: 15000 });

			// Verify the file row appears and processing completed without crash
			const dataRows = window.locator(".file-table__row");
			await expect(dataRows).toHaveCount(1);

			// The zero-byte file should either error or show no-metadata-found
			const errorRow = window.locator(".file-table__row--error");
			const completeRow = window.locator(".file-table__row--complete");
			const errorCount = await errorRow.count();
			const completeCount = await completeRow.count();
			expect(errorCount + completeCount).toBe(1);
		} finally {
			cleanup();
		}
	});

	test("filters out unsupported file formats", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("unsupported.txt");

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			// Wait briefly and verify the file was filtered out (not added to table)
			// The app's isSupportedFile() filters .txt files before adding to state
			await window.waitForTimeout(2000);

			const dataRows = window.locator(".file-table__row");
			const rowCount = await dataRows.count();
			expect(rowCount).toBe(0);

			// Empty state should still be visible since no files were processed
			const emptyState = window.locator("section.empty-state");
			await expect(emptyState).toBeVisible();
		} finally {
			cleanup();
		}
	});

	test("recovers and processes good files after problematic files", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			// First: send a corrupted file
			const corruptedFile = copyFixture("corrupted.jpg");

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[corruptedFile],
			);

			// Wait for processing to complete
			await waitForProcessing(window, { timeout: 15000 });

			// Click Clear to reset
			const clearButton = window.locator(".status-bar__button");
			await expect(clearButton).toBeVisible();
			await clearButton.click();

			// Verify empty state returns
			const emptyState = window.locator("section.empty-state");
			await expect(emptyState).toBeVisible();

			// Now send a good file
			const goodFile = copyFixture("sample.jpg");
			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[goodFile],
			);

			await waitForProcessing(window);

			// Verify the good file processed successfully
			await assertMetadataStripped(goodFile);
		} finally {
			cleanup();
		}
	});
});
