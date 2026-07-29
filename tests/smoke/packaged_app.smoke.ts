import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
	launchPackagedApp,
	closePackagedApp,
} from "./helpers/packaged_launcher";
import { createFixtureDir } from "../e2e/helpers/fixture_copier";
import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions";
import { waitForProcessing } from "../e2e/helpers/wait_for_processing";

// Smoke tests for the PACKAGED artifact — the .dmg/.exe/.AppImage a user downloads,
// installed the way a user installs it, not the dev build from out/.
//
// This suite exists because four consecutive releases shipped broken while CI was
// green: CI proved the source tree compiles, and nothing ever proved the shipped
// artifact runs. See .planning/v4.2-DECISIONS.md.
//
// Two deliberate differences from the dev E2E suite in ../e2e:
//
// 1. The console-error allow-list is EMPTY. The dev specs filter out "ExifTool" and
//    "ENOENT" (see e2e/file-processing.spec.ts) — precisely the error class #288
//    produced. Filtering them here would reproduce the blind spot this suite exists
//    to close.
//
// 2. Serial mode. The packaged app holds an OS-level single-instance lock, so
//    concurrent launches deadlock rather than fail cleanly.

test.describe.configure({ mode: "serial" });

test.describe("Packaged artifact", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchPackagedApp();
		app = launched.app;
		window = launched.window;

		window.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		if (app) {
			await closePackagedApp(app);
		}
		expect(
			consoleErrors,
			"Packaged app logged console errors — no allow-list here, unlike the dev suite",
		).toEqual([]);
	});

	test("launches and mounts the UI", async () => {
		await expect(window.locator("[role='main']")).toBeVisible();
		expect(await window.title()).toBe("ExifCleaner");
	});

	test("reports itself as packaged and resolves resources inside the bundle", async () => {
		// Regression lock for #288: the app read NODE_ENV instead of app.isPackaged,
		// so a packaged build silently took the development path and resolved
		// resources relative to process.cwd(), which does not exist once installed.
		const isPackaged = await app.evaluate(({ app: electronApp }) => {
			return electronApp.isPackaged;
		});

		expect(
			isPackaged,
			"app.isPackaged must be true — if false, every resource path resolves to the dev location",
		).toBe(true);
	});

	test("can spawn the bundled ExifTool binary", async () => {
		// Proves the binary survived extraResources packaging, sits outside the asar,
		// and kept its executable bit. A lost exec bit fails at runtime with a
		// confusing EACCES that no UI-level assertion would explain.
		const version = await app.evaluate(async ({ app: electronApp }) => {
			const { join } = await import("node:path");
			const { execFileSync } = await import("node:child_process");

			const subdir = process.platform === "win32" ? "win" : "nix";
			const filename =
				process.platform === "win32" ? "exiftool.exe" : "exiftool";
			const binPath = join(
				electronApp.isPackaged ? process.resourcesPath : process.cwd(),
				subdir,
				"bin",
				filename,
			);

			return execFileSync(binPath, ["-ver"], { encoding: "utf8" }).trim();
		});

		expect(version).toMatch(/^\d+\.\d+/);
	});

	test("strips metadata from a JPEG using the bundled ExifTool", async () => {
		// The single load-bearing assertion in this milestone. It transitively proves:
		// app.isPackaged -> process.resourcesPath -> extraResources survived packing ->
		// exiftoolBinPath resolved at import time to a real file -> stay-open spawn
		// succeeded -> bytes actually changed on disk.
		//
		// A "window opened" assertion would NOT have caught #288: the window renders
		// fine with mis-resolved resource paths.
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

			await assertMetadataStripped(tempFile);
		} finally {
			cleanup();
		}
	});

	test("processes a batch of mixed file types", async () => {
		// Covers the video and PNG code paths, which invoke ExifTool with a different
		// argument shape than JPEG.
		const { copyFixtures, cleanup } = createFixtureDir();
		try {
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
				timeout: 60000,
				expectedFiles: tempFiles.length,
			});

			for (const tempFile of tempFiles) {
				await assertMetadataStripped(tempFile);
			}
		} finally {
			cleanup();
		}
	});
});
