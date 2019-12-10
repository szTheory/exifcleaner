// electron-webpack HMR for development
import { is } from "electron-util";
if (is.development && module.hot) {
	module.hot.accept();
}

import { app } from "electron";
import { setupMenu } from "./menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window_setup";

// Maintain reference to window to
// prevent it from being garbage collected
var win;

async function setup() {
	init({ win: win });
	await app.whenReady();
	setupMenu();
	// keep reference to main window to prevent losing it on GC
	win = await createMainWindow();
	setupMainWindow({ win: win });
}

setup();
