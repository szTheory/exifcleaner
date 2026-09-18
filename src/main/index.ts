import { BrowserWindow, app } from "electron";
import { setupMenus } from "./menu/menu";
import { attachWindow, initProcess } from "./init";
import { createMainWindow, setupMainWindow } from "./window/window_setup";
import { currentBrowserWindow } from "../infrastructure";
import { maybeEnableCrashDumps } from "./security/crash_dumps";

// CI/test-only diagnostic (48-07): no-op unless EXIFCLEANER_CRASH_DUMPS_DIR is set, which no
// real user launch or release build ever has. Must run before app.whenReady() -- crash-dump
// path and reporter registration are only honored when set early. See crash_dumps.ts for the
// full no-telemetry gating rationale.
maybeEnableCrashDumps();

// Maintain reference to window to
// prevent it from being garbage collected
let browserWindow: BrowserWindow | null = null;

async function createAndShowWindow(): Promise<void> {
	browserWindow = createMainWindow();
	attachWindow(browserWindow);
	await initProcess();
	setupMenus();
	setupMainWindow(browserWindow);
}

async function setup(): Promise<void> {
	await app.whenReady();

	// keep reference to main window to prevent losing it on GC
	browserWindow = currentBrowserWindow({ browserWindow });
	if (!browserWindow) {
		await createAndShowWindow();
	}

	// macOS: re-create window when dock icon clicked and all windows are closed
	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			await createAndShowWindow();
		}
	});
}

setup();
