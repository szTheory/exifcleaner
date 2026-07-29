import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

/**
 * Asserts every advertised file type actually processes.
 *
 * The suite already drove PDFs through the UI, but the assertion was that the status bar
 * contained "3" -- the file count. A PDF that hard-errors still counts as a file, so
 * sample.pdf sat broken for the entire v4.0 cycle while the test stayed green and the
 * marketing screenshots quietly rendered three red PDF rows.
 *
 * The lesson generalises: assert on outcomes, not on the presence of UI. So these tests
 * check row *status*, and pair each success case with a matching failure case, because a
 * test that cannot distinguish "processed" from "errored" proves nothing about either.
 */
test.describe("File type coverage", () => {
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

	// One per advertised category: images (raster + modern), documents, video.
	const SUPPORTED = [
		"sample.jpg",
		"sample.png",
		"sample.webp",
		"sample.pdf",
		"sample.mp4",
	];

	for (const fixture of SUPPORTED) {
		test(`${fixture} processes without error`, async () => {
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const filePath = copyFixture(fixture);
				const before = snapshotDir(dir);

				await addFiles([filePath]);
				await waitForProcessing(window);

				const after = snapshotDir(dir);

				// Every supported fixture is stripped in place -- a format handler
				// that "processes without error" but leaves the bytes untouched would
				// pass the row-status assertions below while silently doing nothing.
				assertDirEffect(before, after, {
					modified: [fixture],
					added: [],
					removed: [],
					unchanged: [],
				});

				// The specific regression: an errored row is still a row, so asserting on
				// row presence (or on the status-bar count) passes for a total failure.
				await expect(
					window.locator(".file-table__row--error"),
					`${fixture} landed in the error state`,
				).toHaveCount(0);
				await expect(window.locator(".file-table__row--complete")).toHaveCount(
					1,
				);
			} finally {
				cleanup();
			}
		});
	}

	test("all supported types process together in one batch", async () => {
		const { dir, copyFixtures, cleanup } = createFixtureDir();
		try {
			const filePaths = copyFixtures(SUPPORTED);
			const before = snapshotDir(dir);

			await addFiles(filePaths);
			await waitForProcessing(window, {
				timeout: 30000,
				expectedFiles: SUPPORTED.length,
			});

			const after = snapshotDir(dir);

			// Every fixture in the batch is processed -- none is merely copied in as
			// an unprocessed neighbour here (that asymmetry is exercised by the
			// corrupted-file test below, where the fixture lands in `unchanged`).
			assertDirEffect(before, after, {
				modified: SUPPORTED,
				added: [],
				removed: [],
				unchanged: [],
			});

			await expect(window.locator(".file-table__row--error")).toHaveCount(0);
			await expect(window.locator(".file-table__row--complete")).toHaveCount(
				SUPPORTED.length,
			);
		} finally {
			cleanup();
		}
	});

	/*
	 * The counterpart. Without this, "no error rows" could pass simply because the app
	 * never renders error rows at all -- which is exactly the shape of bug that let the
	 * PDF regression hide.
	 */
	test("a genuinely unprocessable file does land in the error state", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const filePath = copyFixture("corrupted.jpg");
			const before = snapshotDir(dir);

			await addFiles([filePath]);
			await waitForProcessing(window);

			const after = snapshotDir(dir);

			// ExifTool errors out on the corrupted fixture before it ever reaches
			// -overwrite_original, so the original bytes are left exactly as copied --
			// the unprocessed neighbour this suite's "modified" sites are contrasted
			// against.
			assertDirEffect(before, after, {
				unchanged: ["corrupted.jpg"],
				added: [],
				modified: [],
				removed: [],
			});

			await expect(window.locator(".file-table__row--error")).toHaveCount(1);
			await expect(window.locator(".file-table__row--complete")).toHaveCount(0);
		} finally {
			cleanup();
		}
	});
});
