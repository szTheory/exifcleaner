import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "./helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";

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
			const { copyFixture, cleanup } = createFixtureDir();
			try {
				await addFiles([copyFixture(fixture)]);
				await waitForProcessing(window);

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
		const { copyFixtures, cleanup } = createFixtureDir();
		try {
			await addFiles(copyFixtures(SUPPORTED));
			await waitForProcessing(window, {
				timeout: 30000,
				expectedFiles: SUPPORTED.length,
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
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			await addFiles([copyFixture("corrupted.jpg")]);
			await waitForProcessing(window);

			await expect(window.locator(".file-table__row--error")).toHaveCount(1);
			await expect(window.locator(".file-table__row--complete")).toHaveCount(0);
		} finally {
			cleanup();
		}
	});
});
