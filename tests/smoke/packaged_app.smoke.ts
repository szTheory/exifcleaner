import { test, expect } from "@playwright/test";
import {
	FuseV1Options,
	FuseVersion,
	getCurrentFuseWire,
} from "@electron/fuses";
import type { ElectronApplication, Page } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
	launchPackagedApp,
	closePackagedApp,
	type PackagedLaunchContext,
} from "./helpers/packaged_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions";
import { waitForProcessing } from "../e2e/helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";
import { createProcessingDriver } from "../helpers/processing_driver";
import {
	expectNoXattrs,
	expectSeededXattrs,
	seedXattrs,
} from "../e2e/helpers/xattr_assertions";

const SEEDED_XATTRS = [
	{ name: "com.apple.quarantine", valueHex: "303038313b" },
	{ name: "com.apple.metadata:kMDItemWhereFroms", valueHex: "706c616e" },
	{ name: "com.apple.metadata:_kMDItemUserTags", valueHex: "746167" },
];

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
	let context: PackagedLaunchContext | undefined;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchPackagedApp();
		context = launched;
		app = launched.app;
		window = launched.window;

		window.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		if (context) {
			await closePackagedApp(context);
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

	test("ships the approved Electron fuse values in the native executable", async () => {
		if (!context) throw new Error("packaged launch context is missing");
		const fuses = await getCurrentFuseWire(context.originalFuseExecutablePath);
		const disabled = "0".charCodeAt(0);

		expect(fuses.version).toBe(FuseVersion.V1);
		expect(fuses[FuseV1Options.RunAsNode]).toBe(disabled);
		// ExifCleaner has no cookie-backed state; enabling this would needlessly
		// access the platform's secure-storage service during startup.
		expect(fuses[FuseV1Options.EnableCookieEncryption]).toBe(disabled);
		expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(
			disabled,
		);
		expect(fuses[FuseV1Options.EnableNodeCliInspectArguments]).toBe(disabled);
		// These remain disabled while ExifTool is an external resource.
		expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(
			disabled,
		);
		expect(fuses[FuseV1Options.OnlyLoadAppFromAsar]).toBe(disabled);
	});

	test("bundles a working ExifTool binary inside the app", async () => {
		// Proves the binary survived extraResources packaging, sits outside the asar,
		// and kept its executable bit. A lost exec bit fails at runtime with a
		// confusing EACCES that no UI-level assertion would explain.
		//
		// The path is read from the running app (so it reflects real resource
		// resolution) but the binary is executed from the test process — Playwright's
		// app.evaluate has no dynamic-import callback, so requiring modules inside it
		// is not available.
		const resourcesPath = await app.evaluate(({ app: electronApp }) => {
			return electronApp.isPackaged ? process.resourcesPath : process.cwd();
		});

		const subdir = process.platform === "win32" ? "win" : "nix";
		const filename = process.platform === "win32" ? "exiftool.exe" : "exiftool";
		const binPath = path.join(resourcesPath, subdir, "bin", filename);

		expect(
			existsSync(binPath),
			`bundled ExifTool missing at ${binPath} — extraResources did not survive packaging`,
		).toBe(true);

		const version = execFileSync(binPath, ["-ver"], {
			encoding: "utf8",
		}).trim();

		expect(version).toBe("13.59");
	});

	test("strips metadata from a JPEG using the bundled ExifTool", async () => {
		// The single load-bearing assertion in this milestone. It transitively proves:
		// app.isPackaged -> process.resourcesPath -> extraResources survived packing ->
		// exiftoolBinPath resolved at import time to a real file -> stay-open spawn
		// succeeded -> bytes actually changed on disk.
		//
		// A "window opened" assertion would NOT have caught #288: the window renders
		// fine with mis-resolved resource paths.
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			if (!context) throw new Error("packaged launch context is missing");
			await createProcessingDriver(context).setSaveAsCopy(false);
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

			await assertMetadataStripped(tempFile);
		} finally {
			cleanup();
		}
	});

	test("processes a batch of mixed file types", async () => {
		// Covers the video and PNG code paths, which invoke ExifTool with a different
		// argument shape than JPEG.
		const { dir, copyFixtures, cleanup } = createFixtureDir();
		try {
			if (!context) throw new Error("packaged launch context is missing");
			await createProcessingDriver(context).setSaveAsCopy(false);
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
				timeout: 60000,
				expectedFiles: tempFiles.length,
			});

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg", "sample.png", "sample.mp4"],
				added: [],
				removed: [],
			});

			for (const tempFile of tempFiles) {
				await assertMetadataStripped(tempFile);
			}
		} finally {
			cleanup();
		}
	});

	test("shows the macOS attributes control only where supported", async () => {
		await window.getByRole("button", { name: "Open settings" }).click();

		const drawer = window.getByRole("dialog", { name: "Settings" });
		await expect(drawer).toBeVisible();

		const macosAttributesSwitch = drawer.getByRole("switch", {
			name: "Remove macOS attributes",
		});
		const macosAttributesLabel = drawer.getByText("Remove macOS attributes", {
			exact: true,
		});

		if (process.platform === "darwin") {
			await expect(macosAttributesSwitch).toBeVisible();
			await expect(macosAttributesSwitch).not.toBeChecked();

			// The semantic input is visually clipped beneath the styled track.
			// Click the visible label, as a user does, while keeping state assertions
			// on the role= switch input.
			await macosAttributesLabel.click();
			await expect(macosAttributesSwitch).toBeChecked();

			await drawer.getByRole("button", { name: "Close settings" }).click();
			await expect(drawer).toHaveCount(0);

			await window.getByRole("button", { name: "Open settings" }).click();
			await expect(macosAttributesSwitch).toBeChecked();

			await macosAttributesLabel.click();
			await expect(macosAttributesSwitch).not.toBeChecked();
		} else {
			await expect(macosAttributesSwitch).toHaveCount(0);
		}
	});

	const xattrTest = process.platform === "darwin" ? test : test.skip;
	xattrTest(
		"clears macOS extended attributes from the installed artifact",
		async () => {
			const { copyFixture, cleanup } = createFixtureDir();
			try {
				await window.getByRole("button", { name: "Open settings" }).click();
				await window.evaluate(() =>
					globalThis.window.api.settings.set({
						removeXattrs: true,
						saveAsCopy: false,
					}),
				);
				await window.waitForTimeout(300);
				expect(await window.locator("#toggle-remove-xattrs").isChecked()).toBe(
					true,
				);

				const filePath = copyFixture("sample.jpg");
				await seedXattrs(filePath, SEEDED_XATTRS);
				await expectSeededXattrs(filePath, SEEDED_XATTRS);
				await app.evaluate(
					({ BrowserWindow }, paths) => {
						BrowserWindow.getAllWindows()[0]?.webContents.send(
							"file-open-add-files",
							paths,
						);
					},
					[filePath],
				);
				await waitForProcessing(window);

				await expect(window.locator(".file-table__row--complete")).toHaveCount(
					1,
				);
				await assertMetadataStripped(filePath);
				await expectNoXattrs(filePath);
			} finally {
				cleanup();
			}
		},
	);
});
