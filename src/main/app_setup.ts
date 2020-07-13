import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window_setup";
import { currentBrowserWindow } from "../common/browser_window";

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
		app.quit();
	});
}

function createWindowOnActivate({ win }: { win: BrowserWindow | null }): void {
	app.on("activate", () => {
		win = currentBrowserWindow(win);
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
