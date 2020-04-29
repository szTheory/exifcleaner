import { is } from "electron-util";
import { BrowserWindow } from "electron";

// electron-webpack HMR for development
if (is.development && module.hot) {
	module.hot.accept();
}

const { app } = require("electron");
const { setupMenu } = require("./menu");
const { init } = require("./init");
const { createMainWindow, setupMainWindow } = require("./window_setup");

// Maintain reference to window to
// prevent it from being garbage collected
var win = null as BrowserWindow | null;

async function setup(): Promise<void> {
	init({ win: win });
	await app.whenReady();
	setupMenu();
	// keep reference to main window to prevent losing it on GC
	win = await createMainWindow();
	setupMainWindow({ win: win });
}

setup();
