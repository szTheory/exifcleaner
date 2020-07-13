import { BrowserWindow } from "electron";
import { isDev } from "../common/is_dev";

// electron-webpack HMR for development
if (isDev && module.hot) {
	module.hot.accept();
}

import { app } from "electron";
import { setupMenu } from "./menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window_setup";
import { currentBrowserWindow } from "../common/browser_window";

// Maintain reference to window to
// prevent it from being garbage collected
var win = null as BrowserWindow | null;

async function setup(): Promise<void> {
	init({ win: win });
	await app.whenReady();
	setupMenu();
	// keep reference to main window to prevent losing it on GC
	win = currentBrowserWindow(win);
	if (!win) {
		win = await createMainWindow();
	}
	setupMainWindow({ win: win });
}

setup();
