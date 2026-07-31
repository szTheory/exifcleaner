import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

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
		const testName =
			fixture === "sample.mp4"
				? "MP4 valid control processes without error"
				: `${fixture} processes without error`;
		test(testName, async () => {
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

	test("MP4 pre-write negative control rejects truncated input without an output", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const filePath = copyFixture("sample.mp4");
			// This is deliberately a pre-write control: removing the moov atom means
			// ExifTool rejects the submitted input before it can create an output. It
			// must never be cited as verifier-cleanup evidence.
			fs.truncateSync(filePath, 1);
			await expect(
				execFileAsync(EXIFTOOL_PATH, ["-json", filePath]),
			).rejects.toMatchObject({
				code: expect.any(Number),
			});
			const before = snapshotDir(dir);

			await addFiles([filePath]);
			await waitForProcessing(window);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				unchanged: ["sample.mp4"],
				added: [],
				modified: [],
				removed: [],
			});
			// This visible error row is the wrong-direction guard: filtering or failing
			// to submit the malformed MP4 leaves no terminal row and fails this test.
			const errorRow = window.locator(".file-table__row--error");
			await expect(errorRow).toHaveCount(1);
			await expect(window.locator(".file-table__row--complete")).toHaveCount(0);
			await errorRow.click();
			await expect(window.locator(".file-table__error-text")).toContainText(
				/\S/,
			);
			await expect(window.locator(".file-table__after-done")).toHaveCount(0);
			await expect(window.locator(".file-table__reveal")).toHaveCount(0);
		} finally {
			cleanup();
		}
	});

	test("RAF forced copy preserves the source, discloses the result, and reveals the written artifact", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const sourcePath = copyFixture("sample.raf");
			const before = snapshotDir(dir);
			await app.evaluate(({ shell }) => {
				const calls: string[] = [];
				const originalShowItemInFolder = shell.showItemInFolder;
				Reflect.set(globalThis, "__rafRevealCalls", calls);
				Reflect.set(globalThis, "__rafRestoreReveal", () => {
					shell.showItemInFolder = originalShowItemInFolder;
				});
				shell.showItemInFolder = (filePath) => {
					calls.push(filePath);
				};
			});

			await addFiles([sourcePath]);
			await waitForProcessing(window);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				unchanged: ["sample.raf"],
				added: ["sample_cleaned.raf"],
				modified: [],
				removed: [],
			});
			const disclosure = window.locator(".file-table__copy-disclosure");
			await expect(disclosure).toHaveCount(1);
			const disclosureText = await disclosure.textContent();
			expect(disclosureText).toMatch(/\S/);
			await expect(window.locator(".file-table__row--complete")).toHaveAttribute(
				"aria-label",
				new RegExp(disclosureText ?? "Written to a copy"),
			);
			await window.locator(".file-table__reveal").click();
			expect(await app.evaluate(() => Reflect.get(globalThis, "__rafRevealCalls"))).toEqual([
				`${dir}/sample_cleaned.raf`,
			]);
		} finally {
			await app.evaluate(() => {
				const restore = Reflect.get(globalThis, "__rafRestoreReveal") as
					| (() => void)
					| undefined;
				restore?.();
			});
			cleanup();
		}
	});
});
