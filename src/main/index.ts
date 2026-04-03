import { BrowserWindow, app } from "electron";
import { setupMenus } from "./menu/menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window/window_setup";
import { currentBrowserWindow } from "../infrastructure";

// Maintain reference to window to
// prevent it from being garbage collected
let browserWindow: BrowserWindow | null = null;

async function createAndShowWindow(): Promise<void> {
	browserWindow = createMainWindow();
	await init({ browserWindow });
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
