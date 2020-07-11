import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window_setup";
import { isMac } from "../common/platform";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists({
	win,
}: {
	win: BrowserWindow | null;
}): void {
	app.on("second-instance", () => {
		if (win) {
			if (win.isMinimized()) {
				win.restore();
			}
			win.show();
			win.focus();
		}
	});
}

function quitOnWindowsAllClosed(): void {
	app.on("window-all-closed", () => {
		// on Mac, the convention is to leave the app
		// open even when all windows are closed. so that for
		// example they can relaunch the app from the dock
		// or still use the drag to dock features
		if (!isMac()) {
			app.quit();
		}
	});
}

function createWindowOnActivate({ win }: { win: BrowserWindow | null }): void {
	app.on("activate", () => {
		if (!win) {
			win = createMainWindow();
		}
	});
}

export function setupApp({ win }: { win: BrowserWindow | null }): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ win: win });
	quitOnWindowsAllClosed();
	createWindowOnActivate({ win: win });
}
