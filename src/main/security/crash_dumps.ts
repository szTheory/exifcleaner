import { app, crashReporter } from "electron";
import fs from "node:fs";

// 48-07 diagnostic (maintainer-authorized, one deliberate CI dispatch to capture a Windows
// native-crash stack trace -- see .planning/phases/48-final-artifact-release-admission/).
export const CRASH_DUMPS_DIR_ENV_VAR = "EXIFCLEANER_CRASH_DUMPS_DIR";

/**
 * Gated exclusively on EXIFCLEANER_CRASH_DUMPS_DIR: absent in every real user launch and in
 * every release build, including the 4.3.0 lineage this branch feeds -- nothing else in this
 * app reads or sets this variable, and no CI workflow sets it outside the diagnostic Windows
 * smoke step. A build that never had it in its environment returns on the very first line;
 * crashReporter.start() is never reached and nothing about this module changes production
 * behavior.
 *
 * uploadToServer is explicitly false and submitURL is the empty string -- this project's
 * first non-negotiable is no telemetry/phone-home, and Electron's crashReporter uploads to a
 * server BY DEFAULT. Both conditions must hold redundantly: uploadToServer:false stops
 * Electron from ever attempting a POST, and an empty submitURL means there is no address to
 * POST to even if that were somehow bypassed. Dumps are written only to the local
 * app.setPath('crashDumps', ...) directory, for a CI workflow step to upload as an artifact
 * afterward -- the same mechanism CI already uses for smoke-report-windows.
 */
export function maybeEnableCrashDumps(): void {
	const dumpsDir = process.env[CRASH_DUMPS_DIR_ENV_VAR];
	if (dumpsDir === undefined || dumpsDir === "") {
		return;
	}
	// Electron does not reliably create this directory itself; the CI workflow only
	// guarantees RUNNER_TEMP exists, not the crash-dumps subdirectory under it.
	fs.mkdirSync(dumpsDir, { recursive: true });
	app.setPath("crashDumps", dumpsDir);
	crashReporter.start({
		submitURL: "",
		uploadToServer: false,
		compress: false,
	});
}
