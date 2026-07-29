import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EXECUTABLE_ENV_VAR = "EXIFCLEANER_PACKAGED_APP";

// Cold-starting a packaged bundle on a hosted CI runner is materially slower than
// electron-vite dev, and the DMG/AppImage path adds first-launch work the dev build
// never does.
const LAUNCH_TIMEOUT_MS = 60000;
const MOUNT_TIMEOUT_MS = 30000;

/**
 * Absolute path to the packaged executable under test, from EXIFCLEANER_PACKAGED_APP.
 *
 * Set by scripts/smoke/install-*.{sh,ps1}, which each print the resolved path:
 *   macOS   <dir>/ExifCleaner.app/Contents/MacOS/ExifCleaner
 *   Windows %LOCALAPPDATA%\Programs\ExifCleaner\ExifCleaner.exe
 *   Linux   <dir>/squashfs-root/AppRun
 *
 * Throws loudly rather than letting Playwright fail with an opaque spawn ENOENT —
 * a smoke suite that silently passes against nothing is worse than no suite.
 */
export function packagedExecutablePath(): string {
	const executablePath = process.env[EXECUTABLE_ENV_VAR];

	if (executablePath === undefined || executablePath === "") {
		throw new Error(
			`${EXECUTABLE_ENV_VAR} is not set. The smoke project tests a PACKAGED artifact, ` +
				`so it must be pointed at one:\n` +
				`  macOS:   SMOKE=$(scripts/smoke/install-macos.sh dist/*arm64.dmg /tmp/smoke)\n` +
				`  then:    ${EXECUTABLE_ENV_VAR}="$SMOKE" yarn test:smoke`,
		);
	}

	if (!existsSync(executablePath)) {
		throw new Error(
			`${EXECUTABLE_ENV_VAR} points at a path that does not exist: ${executablePath}`,
		);
	}

	return executablePath;
}

/**
 * Launch the packaged binary and wait for the React app to mount.
 *
 * Sets no NODE_ENV: `app.isPackaged` is the only environment signal the app consults
 * for resource resolution (the #288 fix), and overriding NODE_ENV would defeat the test.
 *
 * CRITICALLY, launches from a NEUTRAL cwd. This is not incidental — it is the whole
 * reason the suite can catch #288 at all.
 *
 * `resources.ts` falls back to `path.join(process.cwd(), ".resources")` when the app
 * believes it is running in development. Playwright's launch inherits the test runner's
 * cwd, which is the repo root — where `.resources/nix/bin/exiftool` really does exist.
 * So a packaged build with #288 reintroduced resolves its "dev" path to the repo's own
 * resources and works perfectly, and the whole suite passes on a broken artifact.
 *
 * That was measured, not theorized: with no cwd set, all 5 specs passed against a build
 * with the NODE_ENV bug deliberately restored.
 *
 * A real user launching from /Applications has cwd "/", where "/.resources" does not
 * exist. Pointing cwd at an empty temp dir reproduces that, so a mis-resolved path
 * fails here the same way it fails for a user.
 */
export async function launchPackagedApp(): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	const neutralCwd = mkdtempSync(path.join(tmpdir(), "exifcleaner-smoke-cwd-"));

	const app = await electron.launch({
		executablePath: packagedExecutablePath(),
		args: [],
		cwd: neutralCwd,
		timeout: LAUNCH_TIMEOUT_MS,
	});

	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	await window.waitForSelector("[role='main']", { timeout: MOUNT_TIMEOUT_MS });

	return { app, window };
}

export async function closePackagedApp(app: ElectronApplication): Promise<void> {
	await app.close();
}
