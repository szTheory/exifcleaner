import { app, BrowserWindow } from "electron";
import { currentBrowserWindow } from "../common/browser_window";
import { createMainWindow } from "./window_setup";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists(
	browserWindow: BrowserWindow | null
): void {
	app.on("second-instance", () => {
		if (browserWindow) {
			if (browserWindow.isMinimized()) {
				browserWindow.restore();
			}
			browserWindow.show();
			browserWindow.focus();
		}
	});
}

function quitOnWindowsAllClosed(): void {
	app.on("window-all-closed", () => {
		app.quit();
	});
}

function createWindowOnActivate(browserWindow: BrowserWindow | null): void {
	app.on("activate", () => {
		browserWindow = currentBrowserWindow(browserWindow);
		if (!browserWindow) {
			browserWindow = createMainWindow();
		}
	});
}

export function setupApp(browserWindow: BrowserWindow | null): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists(browserWindow);
	quitOnWindowsAllClosed();
	createWindowOnActivate(browserWindow);
}
