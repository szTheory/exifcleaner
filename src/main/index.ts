import { BrowserWindow, app } from "electron";
import { setupMenus } from "./menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window_setup";
import { currentBrowserWindow } from "../infrastructure/electron/browser_window";

// Maintain reference to window to
// prevent it from being garbage collected
var browserWindow = null as BrowserWindow | null;

async function setup(): Promise<void> {
	await app.whenReady();
	await init(browserWindow);
	setupMenus();

	// keep reference to main window to prevent losing it on GC
	browserWindow = currentBrowserWindow(browserWindow);
	if (!browserWindow) {
		browserWindow = createMainWindow();
	}
	setupMainWindow(browserWindow);
}

setup();
