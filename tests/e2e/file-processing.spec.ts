import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertMetadataStripped } from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

test.describe("File Processing", () => {
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
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes("ExifTool") && !msg.includes("ENOENT"),
		);
		if (app) {
			await closeApp(app);
		}
		expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
	});

	test("strips EXIF metadata from a single JPEG file", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			const before = snapshotDir(dir);

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

			const after = snapshotDir(dir);

			// Metadata stripping happens in place: -overwrite_original means the
			// original filename is rewritten, never a second file added.
			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
			});

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

	test("does not rewrite a genuinely metadata-free file", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("no_metadata.jpg");
			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					BrowserWindow.getAllWindows()[0]?.webContents.send(
						"file-open-add-files",
						filePaths,
					);
				},
				[tempFile],
			);
			await waitForProcessing(window);

			assertDirEffect(before, snapshotDir(dir), {
				unchanged: ["no_metadata.jpg"],
				added: [],
				modified: [],
				removed: [],
			});
			await expect(window.locator(".file-table__error-summary")).toContainText(
				"No removable metadata found",
			);
		} finally {
			cleanup();
		}
	});

	test("processes a batch of 3 mixed file types", async () => {
		const { dir, copyFixtures, cleanup } = createFixtureDir();
		try {
			// Use file types proven reliable across macOS, Windows, and Linux CI:
			// JPEG (standard image), PNG (lossless), MP4 (video container)
			const tempFiles = copyFixtures([
				"sample.jpg",
				"sample.png",
				"sample.mp4",
			]);

			const before = snapshotDir(dir);

			await app.evaluate(({ BrowserWindow }, filePaths) => {
				const win = BrowserWindow.getAllWindows()[0];
				if (win) {
					win.webContents.send("file-open-add-files", filePaths);
				}
			}, tempFiles);

			await waitForProcessing(window, {
				timeout: 30000,
				expectedFiles: 3,
			});

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg", "sample.png", "sample.mp4"],
				added: [],
				removed: [],
			});

			// Verify all 3 file rows visible
			const dataRows = window.locator(".file-table__row");
			await expect(dataRows).toHaveCount(3);

			// Verify status bar shows completion info
			const statusBar = window.locator("footer.status-bar");
			await expect(statusBar).toBeVisible();

			// Verify all rows show completion (auto-retrying assertion)
			const completeRows = window.locator(".file-table__row--complete");
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
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

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

			await waitForProcessing(window);

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
			});

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
		const { dir, copyFixtures, cleanup } = createFixtureDir();
		try {
			const tempFiles = copyFixtures([
				"sample.jpg",
				"sample.png",
				"sample.pdf",
			]);

			const before = snapshotDir(dir);

			await app.evaluate(({ BrowserWindow }, filePaths) => {
				const win = BrowserWindow.getAllWindows()[0];
				if (win) {
					win.webContents.send("file-open-add-files", filePaths);
				}
			}, tempFiles);

			await waitForProcessing(window);

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg", "sample.png", "sample.pdf"],
				added: [],
				removed: [],
			});

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
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			// First cycle: process a file
			const tempFile1 = copyFixture("sample.jpg");

			// Baseline taken with only tempFile1 on disk (tempFile2 doesn't exist
			// yet), so the eventual delta can tell "modified in place" (tempFile1,
			// present both before and after) apart from "newly created during this
			// test" (tempFile2, copied in mid-test for the second cycle) — the two
			// cycles exercise different disk-effect shapes and the assertion below
			// is written to catch either one collapsing into the other.
			const before = snapshotDir(dir);

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

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: ["sample.png"],
				removed: [],
			});

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
