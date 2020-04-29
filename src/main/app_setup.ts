import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window_setup";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists({ win }: { win: BrowserWindow }): void {
	app.on("second-instance", () => {
		if (win) {
			if (win.isMinimized()) {
				win.restore();
			}
			win.show();
		}
	});
}

function quitOnWindowsAllClosed(): void {
	app.on("window-all-closed", () => {
		app.quit();
	});
}

function createWindowOnActivate({ win }: { win: BrowserWindow }): void {
	app.on("activate", () => {
		if (!win) {
			win = createMainWindow();
		}
	});
}

export function setupApp({ win }: { win: BrowserWindow }): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ win: win });
	quitOnWindowsAllClosed();
	createWindowOnActivate({ win: win });
}
