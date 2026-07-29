import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import { existsSync } from "node:fs";

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
 * Deliberately sets no NODE_ENV and no cwd. `app.isPackaged` is the only environment
 * signal the app consults for resource resolution (that was the #288 fix), and a
 * packaged app must resolve everything from `process.resourcesPath`. Supplying either
 * would mask exactly the class of bug this suite exists to catch.
 */
export async function launchPackagedApp(): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	const app = await electron.launch({
		executablePath: packagedExecutablePath(),
		args: [],
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
