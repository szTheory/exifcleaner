import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

/**
 * Regression tests for the SIZE column, which read "0 B" for every file in every
 * shipped build until 2026-07-29.
 *
 * The cause was not a formatting bug — formatFileSize was correct and had passing
 * unit tests. All three code paths that build a FileEntry passed a literal 0, and
 * every existing test fed size in as a fixture (`size: 1024`), so nothing ever
 * exercised the wiring that populates it. The E2E suite drove real files through
 * the real UI and still missed it, because it asserted that cells were *visible*
 * rather than that their values were *right*. A dead column renders "0 B"
 * flawlessly and passes a visibility check.
 *
 * These tests therefore assert against the on-disk size, and deliberately include
 * a genuinely empty file: "0 B" is the correct answer for one of these fixtures
 * and a bug for the others, so a test that cannot tell them apart is worthless.
 */
test.describe("File size display", () => {
	let app: ElectronApplication;
	// Hazard: this Page-typed variable is named `window`, which shadows the DOM global
	// inside no-argument .evaluate() closures (TypeScript resolves lexically, not to
	// the in-page context). See settings.spec.ts for the fix if this file grows an
	// .evaluate(() => window....) call that needs type-checking.
	let window: Page;

	test.beforeEach(async () => {
		const launched = await launchApp();
		app = launched.app;
		window = launched.window;
	});

	test.afterEach(async () => {
		if (app) {
			await closeApp(app);
		}
	});

	async function addFiles(filePaths: string[]): Promise<void> {
		await app.evaluate(({ BrowserWindow }, paths) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("file-open-add-files", paths);
			}
		}, filePaths);
	}

	test("shows the real byte size of a processed file", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			// Captured BEFORE processing on purpose. The column reports the size of
			// the file as added, and stripping metadata shrinks it (711 -> 315 bytes
			// for this fixture), so stat()ing afterwards compares against the wrong
			// number and fails a correct app.
			const sizeWhenAdded = fs.statSync(tempFile).size;
			expect(
				sizeWhenAdded,
				"fixture must be non-empty for this test to mean anything",
			).toBeGreaterThan(0);
			// Under 1 KB, so formatFileSize renders whole bytes and the expectation
			// below does not have to restate the unit-scaling rules it is testing
			// around. Guarded rather than assumed — sample.mp4 is 3182 bytes and
			// renders "3.1 KB", which is how this test first went wrong.
			expect(sizeWhenAdded).toBeLessThan(1024);

			const before = snapshotDir(dir);

			await addFiles([tempFile]);
			await waitForProcessing(window);

			const after = snapshotDir(dir);

			// 711 -> 315 bytes in place is the byte-level version of what the
			// displayed size column is asserting above -- this closes the
			// same-size/different-bytes gap the helper exists to catch, just on the
			// spec that already proved the shrink numerically.
			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
			});

			const sizeCell = window.locator(".file-table__cell--size").first();
			await expect(sizeCell).toHaveText(`${sizeWhenAdded} B`);
		} finally {
			cleanup();
		}
	});

	test("shows 0 B only when the file is genuinely empty", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const emptyFile = copyFixture("zero_byte.jpg");
			expect(fs.statSync(emptyFile).size).toBe(0);

			const before = snapshotDir(dir);

			await addFiles([emptyFile]);

			const sizeCell = window.locator(".file-table__cell--size").first();
			// toHaveText is the wait here (auto-retrying) — there is no separate
			// waitForProcessing call for this test, so the after-snapshot is taken
			// once this assertion has settled, not immediately after addFiles.
			await expect(sizeCell).toHaveText("0 B");

			const after = snapshotDir(dir);

			// A zero-byte file has no header for ExifTool to write against; it
			// errors before -overwrite_original and stays untouched at 0 bytes.
			assertDirEffect(before, after, {
				unchanged: ["zero_byte.jpg"],
				added: [],
				modified: [],
				removed: [],
			});
		} finally {
			cleanup();
		}
	});

	test("gives each row its own size rather than repeating one value", async () => {
		const { dir, copyFixtures, cleanup } = createFixtureDir();
		try {
			// Three fixtures with three distinct sizes, so a mapping bug that gives
			// every row the same value shows up as duplicate labels. Asserts on
			// distinctness rather than exact strings: the point here is that each row
			// gets *its own* size, and restating formatFileSize's unit thresholds
			// would only re-test the formatter, which has its own unit tests.
			const tempFiles = copyFixtures([
				"sample.jpg",
				"sample.png",
				"sample.mp4",
			]);
			const sizesWhenAdded = tempFiles.map((f) => fs.statSync(f).size);
			expect(
				new Set(sizesWhenAdded).size,
				"fixtures must have distinct sizes for this test to detect mismapping",
			).toBe(3);

			const before = snapshotDir(dir);

			await addFiles(tempFiles);
			await waitForProcessing(window, { timeout: 30000, expectedFiles: 3 });

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg", "sample.png", "sample.mp4"],
				added: [],
				removed: [],
			});

			const labels = await window
				.locator(".file-table__cell--size")
				.allTextContents();
			expect(labels).toHaveLength(3);
			expect(new Set(labels).size, "each row should show its own size").toBe(3);
			expect(labels).not.toContain("0 B");
		} finally {
			cleanup();
		}
	});

	/**
	 * The status bar is the other place the UI reports computed numbers, so it can
	 * fail the same silent way. The existing suite only asserted the summary was
	 * visible and contained "3" (the file count) — a hardcoded zero in the tag
	 * count or timer would have sailed through that.
	 */
	test("status bar reports a real tag count, not a placeholder", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			const before = snapshotDir(dir);

			await addFiles([tempFile]);
			await waitForProcessing(window);

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
			});

			// Addressed via data-stat rather than by matching the rendered sentence:
			// the app follows the host system locale, so a prose assertion passes in
			// CI and fails on, say, a French machine. This first draft asserted
			// /(\d+) tags removed/ and failed locally against "1 balises supprimées".
			const tagsRemoved = window.locator('[data-stat="tags-removed"]');
			await expect(tagsRemoved).toBeVisible();
			const value = await tagsRemoved.getAttribute("data-value");
			expect(
				Number(value),
				"sample.jpg carries metadata, so a zero here means the count is not wired",
			).toBeGreaterThan(0);
		} finally {
			cleanup();
		}
	});
});
