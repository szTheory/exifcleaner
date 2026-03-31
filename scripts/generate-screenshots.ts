/**
 * Automated screenshot generation for the ExifCleaner website.
 *
 * Launches the Electron app via Playwright, drives it through 5 UI states,
 * and saves PNGs to the website's static images directory.
 *
 * Screenshots are captured WITHOUT macOS window chrome -- the chrome overlay
 * is added via CSS in the website layout (Plan 03). This separates concerns
 * and makes screenshots easier to regenerate.
 *
 * Usage:
 *   npx tsx scripts/generate-screenshots.ts
 *   yarn screenshots
 */

import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.resolve(
	projectRoot,
	"../exifcleaner-website/static/images/screenshots",
);
const fixturesDir = path.resolve(projectRoot, "tests/e2e/fixtures");

async function ensureBuilt(): Promise<void> {
	const mainBundle = path.join(projectRoot, "out/main/index.js");
	if (!fs.existsSync(mainBundle)) {
		console.log("Building app (yarn compile)...");
		execSync("yarn compile", { cwd: projectRoot, stdio: "inherit" });
	} else {
		console.log("App already built, skipping compile.");
	}
}

async function createTempFixtures(): Promise<{
	files: string[];
	cleanup: () => void;
}> {
	const os = await import("node:os");
	const tmpDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "exifcleaner-screenshots-"),
	);

	const fixtureNames = [
		"sample.jpg",
		"sample.png",
		"sample.pdf",
		"sample.webp",
	];
	const files: string[] = [];

	for (const name of fixtureNames) {
		const src = path.join(fixturesDir, name);
		const dest = path.join(tmpDir, name);
		fs.copyFileSync(src, dest);
		files.push(dest);
	}

	return {
		files,
		cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
	};
}

async function launchApp(): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	const app = await electron.launch({
		args: ["."],
		cwd: projectRoot,
		env: {
			...process.env,
			NODE_ENV: "development",
		},
		timeout: 15000,
	});
	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	await window.waitForSelector("[role='main']", { timeout: 10000 });
	return { app, window };
}

async function waitForProcessing(
	window: Page,
	timeout = 15000,
): Promise<void> {
	const pollInterval = 200;
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const state = await window.evaluate(() => {
			const rows = document.querySelectorAll(".file-table__row");
			const spinners = document.querySelectorAll(".status-icon__spinner");
			return {
				rowCount: rows.length,
				spinnerCount: spinners.length,
			};
		});

		if (state.rowCount > 0 && state.spinnerCount === 0) {
			return;
		}

		await window.waitForTimeout(pollInterval);
	}

	throw new Error(
		`waitForProcessing timed out after ${timeout}ms`,
	);
}

async function sendFiles(
	app: ElectronApplication,
	filePaths: string[],
): Promise<void> {
	await app.evaluate(
		({ BrowserWindow }, paths) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("file-open-add-files", paths);
			}
		},
		filePaths,
	);
}

async function setWindowSize(
	app: ElectronApplication,
	width: number,
	height: number,
): Promise<void> {
	await app.evaluate(
		({ BrowserWindow }, { w, h }) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.setSize(w, h);
				win.center();
			}
		},
		{ w: width, h: height },
	);
}

async function screenshot(window: Page, name: string): Promise<void> {
	const outputPath = path.join(outputDir, name);
	await window.screenshot({ path: outputPath });
	const stats = fs.statSync(outputPath);
	console.log(
		`  Saved: ${name} (${Math.round(stats.size / 1024)} KB)`,
	);
}

async function main(): Promise<void> {
	console.log("ExifCleaner Screenshot Generator\n");

	// Step 1: Ensure app is built
	await ensureBuilt();

	// Step 2: Create output directory
	fs.mkdirSync(outputDir, { recursive: true });

	// Step 3: Create temp copies of fixture files
	const { files: tempFiles, cleanup } = await createTempFixtures();

	let app: ElectronApplication | undefined;

	try {
		// Step 4: Launch the app
		console.log("Launching app...");
		const launched = await launchApp();
		app = launched.app;
		const window = launched.window;

		// Set consistent window size for screenshots
		await setWindowSize(app, 1200, 800);
		await window.waitForTimeout(500);

		// ---- State 1: Light mode with files processed ----
		console.log("\n[1/5] Light mode with files processed");

		// Ensure light theme
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "light";
		});
		await window.waitForTimeout(300);

		// Send files for processing
		await sendFiles(app, tempFiles);
		await waitForProcessing(window, 30000);
		await window.waitForTimeout(500);

		await screenshot(window, "light-processed.png");

		// ---- State 2: Dark mode with files processed ----
		console.log("[2/5] Dark mode with files processed");

		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "dark";
		});
		await window.waitForTimeout(500);

		await screenshot(window, "dark-processed.png");

		// ---- State 3: Settings drawer open ----
		console.log("[3/5] Settings drawer open");

		// Switch back to light mode for settings screenshot
		await app.evaluate(({ nativeTheme }) => {
			nativeTheme.themeSource = "light";
		});
		await window.waitForTimeout(300);

		// Open settings via gear icon click
		const gearButton = window.locator(".gear-icon");
		await gearButton.click();
		await window.waitForTimeout(500);

		// Verify settings drawer is visible
		const drawer = window.locator(
			'[role="dialog"][aria-label="Settings"]',
		);
		await drawer.waitFor({ state: "visible", timeout: 5000 });

		await screenshot(window, "settings-open.png");

		// ---- State 4: Metadata diff expanded ----
		console.log("[4/5] Metadata diff expanded");

		// Close settings drawer
		const closeButton = drawer.locator('[aria-label="Close settings"]');
		await closeButton.click();
		await window.waitForTimeout(500);

		// Click on a processed file row to expand metadata
		const fileRow = window
			.locator(".file-table__row--complete")
			.first();
		await fileRow.click();

		// Wait for metadata expansion to be visible
		const expansion = window.locator(".metadata-expansion");
		await expansion.waitFor({ state: "visible", timeout: 5000 });

		// Expand the first metadata group to show some content
		const groupHeaders = expansion.locator(
			".metadata-group__header",
		);
		const groupCount = await groupHeaders.count();
		if (groupCount > 0) {
			await groupHeaders.first().click();
			await window.waitForTimeout(300);
		}

		await screenshot(window, "metadata-diff.png");

		// ---- State 5: Language switching ----
		console.log("[5/5] Language switching");

		// Collapse the expanded file row by clicking it again
		await fileRow.click();
		await window.waitForTimeout(300);

		// Open settings drawer again
		await gearButton.click();
		await window.waitForTimeout(500);
		await drawer.waitFor({ state: "visible", timeout: 5000 });

		// Switch language via IPC to show a non-English locale
		// This demonstrates the language switching capability
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "ja");
		await window.waitForTimeout(500);

		await screenshot(window, "language-switch.png");

		// Reset language back to English
		await app.evaluate(({ BrowserWindow }, locale) => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				win.webContents.send("language:changed", locale);
			}
		}, "en");

		console.log("\nAll 5 screenshots generated successfully!");
		console.log(`Output directory: ${outputDir}`);
	} finally {
		if (app) {
			await app.close();
		}
		cleanup();
	}
}

main().catch((err) => {
	console.error("Screenshot generation failed:", err);
	process.exit(1);
});
