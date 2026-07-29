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
 * Environment an extracted AppImage needs that the AppImage runtime would normally provide.
 *
 * `AppRun` resolves the real binary as `$APPDIR/<name>`. When an AppImage is run
 * normally, its bundled runtime FUSE-mounts the payload and exports `APPDIR` before
 * exec'ing `AppRun`. `--appimage-extract` does neither: it only unpacks the squashfs,
 * so `AppRun` inherits an empty `APPDIR` and tries to exec `/exifcleaner`.
 *
 * Measured on CI (Ubuntu, run 30419211027) before this was set:
 *   AppRun: line 45: /exifcleaner: No such file or directory
 *
 * Setting `APPDIR` to the extraction root is exactly what the runtime does, so `AppRun`
 * keeps doing its remaining job (notably exporting LD_LIBRARY_PATH for the bundled libs)
 * rather than being bypassed by launching the inner binary directly.
 *
 * Returns an empty object off the AppImage path, so macOS and Windows are untouched.
 */
function appImageEnv(executablePath: string): Record<string, string> {
	if (path.basename(executablePath) !== "AppRun") {
		return {};
	}

	return { APPDIR: path.dirname(executablePath) };
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
	const executablePath = packagedExecutablePath();

	// process.env values are typed string | undefined; filter the undefined ones out
	// before spreading, since Playwright's env option requires Record<string, string>.
	const definedEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			definedEnv[key] = value;
		}
	}

	const app = await electron.launch({
		executablePath,
		args: [],
		cwd: neutralCwd,
		env: { ...definedEnv, ...appImageEnv(executablePath) },
		timeout: LAUNCH_TIMEOUT_MS,
	});

	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	await window.waitForSelector("[role='main']", { timeout: MOUNT_TIMEOUT_MS });

	return { app, window };
}

export async function closePackagedApp(
	app: ElectronApplication,
): Promise<void> {
	await app.close();
}
