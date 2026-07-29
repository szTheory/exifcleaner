import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function launchApp(): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	// A private profile per launch, for two reasons.
	//
	// The app takes a single-instance lock keyed on the user-data directory. Sharing the
	// default one means every test in the suite fails at launch whenever a real
	// ExifCleaner happens to be open on the machine -- the second instance quits
	// immediately, and the failure surfaces as an opaque "Target page has been closed".
	//
	// It also pins settings to their defaults. Otherwise tests read whatever the developer
	// last configured (save-as-copy, language, preserve-orientation), so a suite that
	// passes locally can fail in CI or on a colleague's machine for reasons invisible in
	// the test source.
	const userDataDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "exifcleaner-e2e-profile-"),
	);

	// process.env values are typed string | undefined; filter the undefined ones out
	// before spreading, since Playwright's env option requires Record<string, string>.
	const definedEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			definedEnv[key] = value;
		}
	}

	const app = await electron.launch({
		args: [".", `--user-data-dir=${userDataDir}`],
		cwd: path.resolve(__dirname, "../../.."),
		env: {
			...definedEnv,
			// Use "development" so resource paths resolve to .resources/ in project root
			// (not the Electron.app bundle). The compiled output in out/ is still used.
			NODE_ENV: "development",
		},
		timeout: 15000,
	});
	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	// Wait for the React app to mount (main element with role="main")
	await window.waitForSelector("[role='main']", { timeout: 10000 });
	return { app, window };
}

export async function closeApp(app: ElectronApplication): Promise<void> {
	await app.close();
}
