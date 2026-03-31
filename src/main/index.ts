import { BrowserWindow, app } from "electron";
import { setupMenus } from "./menu/menu";
import { init } from "./init";
import { createMainWindow, setupMainWindow } from "./window/window_setup";
import { currentBrowserWindow } from "../infrastructure";

// Maintain reference to window to
// prevent it from being garbage collected
var browserWindow = null as BrowserWindow | null;

async function setup(): Promise<void> {
	await app.whenReady();

	// keep reference to main window to prevent losing it on GC
	browserWindow = currentBrowserWindow(browserWindow);
	if (!browserWindow) {
		browserWindow = createMainWindow();
	}

	// Order matters: createMainWindow() first (uses loadWindowState + dynamic bg),
	// then init() (registers sender ID, sets up IPC/theme handlers),
	// then setupMainWindow() (loads URL, shows on ready, wires state persistence)
	await init(browserWindow);
	setupMenus();
	setupMainWindow(browserWindow);
}

setup();
