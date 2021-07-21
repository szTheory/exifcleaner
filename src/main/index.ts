import { BrowserWindow, app } from "electron";

import { setupMenus } from "./menu.js";
import { init } from "./init.js";
import { createMainWindow, setupMainWindow } from "./window_setup.js";
import { currentBrowserWindow } from "../common/browser_window.js";

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
