import { BrowserWindow } from "electron";

import { app } from "electron";
import { setupMenus } from "./menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window_setup";
import { currentBrowserWindow } from "../common/browser_window";

// Maintain reference to window to
// prevent it from being garbage collected
var browserWindow = null as BrowserWindow | null;

async function setup(): Promise<void> {
	init(browserWindow);
	await app.whenReady();
	setupMenus();

	// keep reference to main window to prevent losing it on GC
	browserWindow = currentBrowserWindow(browserWindow);
	if (!browserWindow) {
		browserWindow = createMainWindow();
	}
	setupMainWindow(browserWindow);
}

setup();
