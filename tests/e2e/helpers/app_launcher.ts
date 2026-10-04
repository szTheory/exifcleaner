import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Settings } from "../../../src/domain/settings_schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_LAUNCH_TIMEOUT_MS = process.env["CI"] === undefined ? 15_000 : 30_000;

// Profiles this module created. Only these are ours to delete: a directory the caller
// passed in that we did not create belongs to the caller, who may still want it.
const launcherProfiles = new Set<string>();

type OwnedProfile = {
	// Set by closeApp when the caller is about to relaunch against the same profile.
	keep: boolean;
	// Settles once the Electron process has exited and the profile is removed (or kept).
	settled: Promise<void>;
};

const ownedProfiles = new WeakMap<ElectronApplication, OwnedProfile>();

export async function launchApp(options?: {
	settings?: Partial<Settings>;
	userDataDir?: string;
	pinEnglish?: boolean;
}): Promise<{
	app: ElectronApplication;
	window: Page;
	userDataDir: string;
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
	const userDataDir =
		options?.userDataDir ??
		fs.mkdtempSync(path.join(os.tmpdir(), "exifcleaner-e2e-profile-"));
	if (options?.userDataDir === undefined) {
		launcherProfiles.add(userDataDir);
	}

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
		timeout: APP_LAUNCH_TIMEOUT_MS,
	});
	// Registered before anything else can fail, so the profile goes away however this
	// launch ends: closeApp, a crash, or a test that throws before it closes the app.
	if (launcherProfiles.has(userDataDir)) {
		removeProfileAfterExit(app, userDataDir);
	}
	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	// Wait for the React app to mount (main element with role="main")
	await window.waitForSelector("[role='main']", { timeout: 10000 });
	// Most E2E assertions intentionally use English copy. A fresh profile still
	// defaults to the host OS language, so pin English unless a test explicitly
	// requests another locale. This keeps the suite deterministic on non-English
	// developer machines and runners.
	const settings = {
		...(options?.pinEnglish === false ? {} : { language: "en" as const }),
		...options?.settings,
	} satisfies Partial<Settings>;
	if (Object.keys(settings).length > 0) {
		await window.evaluate(
			(nextSettings) => globalThis.window.api.settings.set(nextSettings),
			settings,
		);
	}
	return { app, window, userDataDir };
}

// Pass keepUserDataDir when the test relaunches against the same profile (settings
// persistence). The relaunch then owns the profile and removes it when it exits.
export async function closeApp(
	app: ElectronApplication,
	options?: { keepUserDataDir?: boolean },
): Promise<void> {
	const profile = ownedProfiles.get(app);
	if (profile !== undefined && options?.keepUserDataDir === true) {
		profile.keep = true;
	}
	await app.close();
	await profile?.settled;
}

// Electron holds the profile open until its main process exits, so removal waits for
// the exit event rather than for app.close() to resolve. Without this, every launch
// left a directory behind in the OS temp dir.
function removeProfileAfterExit(
	app: ElectronApplication,
	userDataDir: string,
): void {
	const child = app.process();
	const profile: OwnedProfile = { keep: false, settled: Promise.resolve() };
	profile.settled = new Promise<void>((resolve) => {
		const remove = (): void => {
			if (!profile.keep) {
				launcherProfiles.delete(userDataDir);
				try {
					// Helper processes can still be flushing for a moment after the main
					// process exits; the retries absorb the resulting ENOTEMPTY.
					fs.rmSync(userDataDir, {
						recursive: true,
						force: true,
						maxRetries: 5,
						retryDelay: 100,
					});
				} catch (error) {
					console.warn(`Could not remove e2e profile ${userDataDir}:`, error);
				}
			}
			resolve();
		};
		if (child.exitCode !== null || child.signalCode !== null) {
			remove();
		} else {
			child.once("exit", remove);
		}
	});
	ownedProfiles.set(app, profile);
}
