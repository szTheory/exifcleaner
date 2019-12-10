import { app } from "electron";
import { is } from "electron-util";
import { createMainWindow } from "./window_setup";

function preventMultipleAppInstances() {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists({ win }) {
	app.on("second-instance", () => {
		if (win) {
			if (win.isMinimized()) {
				win.restore();
			}
			win.show();
		}
	});
}

function quitOnWindowsAllClosed() {
	app.on("window-all-closed", () => {
		if (!is.macos) {
			app.quit();
		}
	});
}

function createWindowOnActivate({ win }) {
	app.on("activate", () => {
		if (!win) {
			win = createMainWindow();
		}
	});
}

export const setupApp = function({ win }) {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ win: win });
	quitOnWindowsAllClosed();
	createWindowOnActivate({ win: win });
};
