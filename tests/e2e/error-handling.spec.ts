import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

test.describe("Error Handling", () => {
	let app: ElectronApplication;
	// Hazard: this Page-typed variable is named `window`, which shadows the DOM global
	// inside no-argument .evaluate() closures (TypeScript resolves lexically, not to
	// the in-page context). See settings.spec.ts for the fix if this file grows an
	// .evaluate(() => window....) call that needs type-checking.
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp({ settings: { saveAsCopy: false } });
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
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("corrupted.jpg");

			const before = snapshotDir(dir);

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

			const after = snapshotDir(dir);

			// ExifTool errors out on the corrupted fixture and never reaches
			// -overwrite_original, so the original bytes are left exactly as
			// copied -- a partial or truncated write here would be the write-side
			// half of the #304 failure class, just triggered by a bad input
			// instead of a bad setting.
			assertDirEffect(before, after, {
				unchanged: ["corrupted.jpg"],
				added: [],
				modified: [],
				removed: [],
			});

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
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("zero_byte.jpg");

			const before = snapshotDir(dir);

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

			const after = snapshotDir(dir);

			// A zero-byte file has no valid header for ExifTool to write against,
			// so it errors before -overwrite_original and the fixture stays at 0
			// bytes -- distinct from "0 B is correct" (file-size-display.spec.ts),
			// this asserts nothing was written at all.
			assertDirEffect(before, after, {
				unchanged: ["zero_byte.jpg"],
				added: [],
				modified: [],
				removed: [],
			});

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

	for (const fixture of ["unsupported.txt", "sample.mkv"] as const) {
		test(`filters out unsupported file format ${fixture}`, async () => {
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const tempFile = copyFixture(fixture);

				const before = snapshotDir(dir);

				await app.evaluate(
					({ BrowserWindow }, filePaths) => {
						const win = BrowserWindow.getAllWindows()[0];
						if (win) {
							win.webContents.send("file-open-add-files", filePaths);
						}
					},
					[tempFile],
				);

				await expect(window.locator(".toast")).toContainText(
					"1 unsupported files skipped",
				);

				const after = snapshotDir(dir);

				// isSupportedFile() filters this out in the renderer before any IPC
				// call reaches ExifTool, so the file is never even opened for writing.
				assertDirEffect(before, after, {
					unchanged: [fixture],
					added: [],
					modified: [],
					removed: [],
				});

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
	}

	test("recovers and processes good files after problematic files", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			// First: send a corrupted file
			const corruptedFile = copyFixture("corrupted.jpg");

			// Baseline taken with only the corrupted fixture on disk (the good
			// fixture is copied in later, mid-test), so the delta below can tell
			// "left alone because it failed" (corrupted.jpg, present both before
			// and after) apart from "written because it succeeded" (sample.jpg,
			// copied in after this snapshot for the second attempt).
			const before = snapshotDir(dir);

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

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				unchanged: ["corrupted.jpg"],
				added: ["sample.jpg"],
				modified: [],
				removed: [],
			});

			// Verify the good file processed successfully
			await assertMetadataStripped(goodFile);
		} finally {
			cleanup();
		}
	});
});
