import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	flipFuses,
	FuseV1Options,
	FuseVersion,
	getCurrentFuseWire,
} from "@electron/fuses";

const EXECUTABLE_ENV_VAR = "EXIFCLEANER_PACKAGED_APP";

// Cold-starting a packaged bundle on a hosted CI runner is materially slower than
// electron-vite dev, and the DMG/AppImage path adds first-launch work the dev build
// never does.
const LAUNCH_TIMEOUT_MS = 30000;
const LAUNCH_ATTEMPTS = 3;
const MOUNT_TIMEOUT_MS = 30000;

export interface PackagedLaunchContext {
	readonly app: ElectronApplication;
	readonly window: Page;
	/** Entrypoint in the ephemeral, one-fuse-instrumented payload. */
	readonly executablePath: string;
	/** Untouched entrypoint installed from the release artifact. */
	readonly originalExecutablePath: string;
	readonly originalExecutableSha256: string;
	/** Untouched Electron Framework/native binary containing the production fuse wire. */
	readonly originalFuseExecutablePath: string;
	readonly originalFuseExecutableSha256: string;
	/** Path shape accepted by @electron/fuses (macOS launcher, native binary elsewhere). */
	readonly originalFuseWireTarget: string;
	readonly originalFuseWire: Awaited<ReturnType<typeof getCurrentFuseWire>>;
	readonly userDataDir: string;
	readonly neutralCwd: string;
	readonly resourcesPath: string;
	readonly exiftoolPath: string;
}

export interface PackagedLaunchOptions {
	/** `null` preserves the product's system-language default. */
	readonly language?: string | null;
}

export function packagedExiftoolPath(
	resourcesPath: string,
	platform: NodeJS.Platform,
): string {
	const subdir = platform === "win32" ? "win" : "nix";
	const filename = platform === "win32" ? "exiftool.exe" : "exiftool";
	return path.join(resourcesPath, subdir, "bin", filename);
}

export function packagedFuseExecutablePath(
	executablePath: string,
	platform: NodeJS.Platform,
): string {
	if (platform === "darwin") {
		return path.resolve(
			path.dirname(executablePath),
			"../Frameworks/Electron Framework.framework/Electron Framework",
		);
	}
	if (platform === "linux" && path.basename(executablePath) === "AppRun") {
		return path.join(path.dirname(executablePath), "exifcleaner");
	}
	return executablePath;
}

export function packagedFuseWireTarget(
	executablePath: string,
	platform: NodeJS.Platform,
): string {
	if (platform === "darwin") return executablePath;
	return packagedFuseExecutablePath(executablePath, platform);
}

function sha256(filePath: string): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

interface InstrumentedPayload {
	readonly executablePath: string;
	readonly originalExecutablePath: string;
	readonly originalExecutableSha256: string;
	readonly originalFuseExecutablePath: string;
	readonly originalFuseExecutableSha256: string;
	readonly originalFuseWireTarget: string;
	readonly originalFuseWire: Awaited<ReturnType<typeof getCurrentFuseWire>>;
	readonly root: string;
}

function assertProductionHardeningFuses(
	fuses: Awaited<ReturnType<typeof getCurrentFuseWire>>,
): void {
	const disabled = "0".charCodeAt(0);
	for (const option of [
		FuseV1Options.RunAsNode,
		FuseV1Options.EnableNodeOptionsEnvironmentVariable,
		FuseV1Options.EnableNodeCliInspectArguments,
	]) {
		if (fuses[option] !== disabled) {
			throw new Error(
				`Installed artifact has insecure fuse value at ${option}`,
			);
		}
	}
}

function assertSameFuseWire(
	actual: Awaited<ReturnType<typeof getCurrentFuseWire>>,
	expected: Awaited<ReturnType<typeof getCurrentFuseWire>>,
): void {
	if (actual.version !== expected.version) {
		throw new Error("Installed artifact fuse version changed during smoke");
	}
	for (const option of Object.values(FuseV1Options)) {
		if (typeof option === "number" && actual[option] !== expected[option]) {
			throw new Error(`Installed artifact fuse value changed at ${option}`);
		}
	}
}

let instrumentedPayloadPromise: Promise<InstrumentedPayload> | undefined;
let instrumentedPayloadRoot: string | undefined;
let cleanupRegistered = false;

async function createInstrumentedPayload(): Promise<InstrumentedPayload> {
	const originalExecutablePath = packagedExecutablePath();
	const originalFuseExecutablePath = packagedFuseExecutablePath(
		originalExecutablePath,
		process.platform,
	);
	const originalFuseWireTarget = packagedFuseWireTarget(
		originalExecutablePath,
		process.platform,
	);
	if (!existsSync(originalFuseExecutablePath)) {
		throw new Error(
			`Packaged fuse-bearing executable is missing: ${originalFuseExecutablePath}`,
		);
	}
	const originalExecutableSha256 = sha256(originalExecutablePath);
	const originalFuseExecutableSha256 = sha256(originalFuseExecutablePath);
	const root = mkdtempSync(path.join(tmpdir(), "exifcleaner-smoke-payload-"));

	let sourceRoot: string;
	let clonedRoot: string;
	let executablePath: string;
	let fuseTarget: string;
	try {
		if (process.platform === "darwin") {
			sourceRoot = path.resolve(path.dirname(originalExecutablePath), "../..");
			clonedRoot = path.join(root, path.basename(sourceRoot));
			// ditto preserves the bundle's relative framework symlinks. Node's cpSync
			// can resolve them back into the installed app, allowing fuse mutation to
			// cross the clone boundary.
			execFileSync("ditto", [sourceRoot, clonedRoot], { stdio: "ignore" });
			executablePath = path.join(
				clonedRoot,
				"Contents",
				"MacOS",
				path.basename(originalExecutablePath),
			);
			fuseTarget = clonedRoot;
		} else {
			sourceRoot = path.dirname(originalExecutablePath);
			clonedRoot = path.join(root, "payload");
			cpSync(sourceRoot, clonedRoot, {
				recursive: true,
				verbatimSymlinks: true,
			});
			executablePath = path.join(
				clonedRoot,
				path.basename(originalExecutablePath),
			);
			fuseTarget = packagedFuseExecutablePath(executablePath, process.platform);
		}
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}

	let originalFuses: Awaited<ReturnType<typeof getCurrentFuseWire>>;
	try {
		originalFuses = await getCurrentFuseWire(originalFuseWireTarget);
		assertProductionHardeningFuses(originalFuses);
		await flipFuses(fuseTarget, {
			version: FuseVersion.V1,
			[FuseV1Options.EnableNodeCliInspectArguments]: true,
			resetAdHocDarwinSignature: process.platform === "darwin",
		});
		const clonedFuseWireTarget = packagedFuseWireTarget(
			executablePath,
			process.platform,
		);
		const clonedFuses = await getCurrentFuseWire(clonedFuseWireTarget);
		for (const option of Object.values(FuseV1Options)) {
			if (typeof option !== "number") continue;
			const expected =
				option === FuseV1Options.EnableNodeCliInspectArguments
					? "1".charCodeAt(0)
					: originalFuses[option];
			if (clonedFuses[option] !== expected) {
				throw new Error(
					`Smoke clone has an unexpected fuse delta at ${option}`,
				);
			}
		}
		if (sha256(originalExecutablePath) !== originalExecutableSha256) {
			throw new Error(
				"Preparing the smoke clone modified the installed launcher",
			);
		}
		if (sha256(originalFuseExecutablePath) !== originalFuseExecutableSha256) {
			throw new Error(
				"Preparing the smoke clone modified the installed fuse-bearing executable",
			);
		}
		assertSameFuseWire(
			await getCurrentFuseWire(originalFuseWireTarget),
			originalFuses,
		);
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}

	return {
		executablePath,
		originalExecutablePath,
		originalExecutableSha256,
		originalFuseExecutablePath,
		originalFuseExecutableSha256,
		originalFuseWireTarget,
		originalFuseWire: originalFuses,
		root,
	};
}

function instrumentedPayload(): Promise<InstrumentedPayload> {
	if (instrumentedPayloadPromise === undefined) {
		instrumentedPayloadPromise = createInstrumentedPayload()
			.then((payload) => {
				instrumentedPayloadRoot = payload.root;
				return payload;
			})
			.catch((error: unknown) => {
				instrumentedPayloadPromise = undefined;
				throw error;
			});
	}
	if (!cleanupRegistered) {
		cleanupRegistered = true;
		process.once("exit", () => {
			if (instrumentedPayloadRoot !== undefined) {
				rmSync(instrumentedPayloadRoot, { recursive: true, force: true });
			}
		});
	}
	return instrumentedPayloadPromise;
}

/**
 * Absolute path to the untouched installed executable, from EXIFCLEANER_PACKAGED_APP.
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
 * Launch an ephemeral full-payload clone and wait for the React app to mount.
 *
 * Playwright's Electron launcher prepends `--inspect=0`, so it cannot drive the
 * production executable after EnableNodeCliInspectArguments is securely fused off.
 * The launcher therefore clones the installed payload and enables only that one fuse
 * on the clone. It checks the clone's complete fuse wire against the original, hashes
 * and rechecks both the installed launcher and the fuse-bearing framework/native
 * executable, never uploads the clone, and deletes it when the smoke worker exits.
 * Product code and the shipped artifact stay unchanged.
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
export async function launchPackagedApp(
	options: PackagedLaunchOptions = {},
): Promise<PackagedLaunchContext> {
	const neutralCwd = mkdtempSync(path.join(tmpdir(), "exifcleaner-smoke-cwd-"));
	const userDataDir = mkdtempSync(
		path.join(tmpdir(), "exifcleaner-smoke-profile-"),
	);
	const userDataArg = `--user-data-dir=${userDataDir}`;

	// process.env values are typed string | undefined; filter the undefined ones out
	// before spreading, since Playwright's env option requires Record<string, string>.
	const definedEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			definedEnv[key] = value;
		}
	}

	try {
		const payload = await instrumentedPayload();
		const executablePath = payload.executablePath;
		let app: ElectronApplication | undefined;
		let lastError: unknown;
		for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt += 1) {
			try {
				app = await electron.launch({
					executablePath,
					args: [userDataArg],
					cwd: neutralCwd,
					env: { ...definedEnv, ...appImageEnv(executablePath) },
					timeout: LAUNCH_TIMEOUT_MS,
				});
				break;
			} catch (error) {
				lastError = error;
				if (process.platform === "linux") {
					try {
						execFileSync("pkill", ["-f", executablePath], {
							stdio: "ignore",
						});
					} catch {
						// No stale process is also a valid cleanup result.
					}
				}
			}
		}
		if (app === undefined) throw lastError;

		try {
			const window = await app.firstWindow();
			await window.waitForLoadState("domcontentloaded");
			await window.waitForSelector("[role='main']", {
				timeout: MOUNT_TIMEOUT_MS,
			});
			const identity = await app.evaluate(({ app: electronApp }) => ({
				isPackaged: electronApp.isPackaged,
				argv: process.argv,
				resourcesPath: process.resourcesPath,
			}));
			if (!identity.isPackaged) {
				throw new Error(
					"Packaged launcher started an unpackaged Electron process",
				);
			}
			if (!identity.argv.includes(userDataArg)) {
				throw new Error(
					`Packaged launcher lost its exact profile argument: ${userDataArg}`,
				);
			}
			if (identity.resourcesPath === "") {
				throw new Error(
					"Packaged launcher reported an empty process.resourcesPath",
				);
			}
			const language = options.language === undefined ? "en" : options.language;
			if (language !== null) {
				await window.evaluate(
					(selectedLanguage) =>
						globalThis.window.api.settings.set({
							language: selectedLanguage,
						}),
					language,
				);
				await window.waitForFunction(
					async (selectedLanguage) =>
						(await globalThis.window.api.settings.get()).language ===
						selectedLanguage,
					language,
				);
			}

			return {
				app,
				window,
				executablePath,
				originalExecutablePath: payload.originalExecutablePath,
				originalExecutableSha256: payload.originalExecutableSha256,
				originalFuseExecutablePath: payload.originalFuseExecutablePath,
				originalFuseExecutableSha256: payload.originalFuseExecutableSha256,
				originalFuseWireTarget: payload.originalFuseWireTarget,
				originalFuseWire: payload.originalFuseWire,
				userDataDir,
				neutralCwd,
				resourcesPath: identity.resourcesPath,
				exiftoolPath: packagedExiftoolPath(
					identity.resourcesPath,
					process.platform,
				),
			};
		} catch (error) {
			await app.close().catch(() => undefined);
			throw error;
		}
	} catch (error) {
		rmSync(userDataDir, { recursive: true, force: true });
		rmSync(neutralCwd, { recursive: true, force: true });
		throw error;
	}
}

export async function closePackagedApp(
	context: PackagedLaunchContext,
): Promise<void> {
	try {
		await context.app.close();
		if (
			sha256(context.originalExecutablePath) !==
			context.originalExecutableSha256
		) {
			throw new Error("Smoke execution modified the installed launcher");
		}
		if (
			sha256(context.originalFuseExecutablePath) !==
			context.originalFuseExecutableSha256
		) {
			throw new Error(
				"Smoke execution modified the installed fuse-bearing executable",
			);
		}
		const currentFuses = await getCurrentFuseWire(
			context.originalFuseWireTarget,
		);
		assertProductionHardeningFuses(currentFuses);
		assertSameFuseWire(currentFuses, context.originalFuseWire);
	} finally {
		rmSync(context.userDataDir, { recursive: true, force: true });
		rmSync(context.neutralCwd, { recursive: true, force: true });
	}
}
