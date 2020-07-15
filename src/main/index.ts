import { BrowserWindow } from "electron";
import { isDev } from "../common/env";

// electron-webpack HMR for development
if (isDev && module.hot) {
	module.hot.accept();
}

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
		browserWindow = await createMainWindow();
	}
	setupMainWindow(browserWindow);
}

setup();
