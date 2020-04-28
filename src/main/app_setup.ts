import { BrowserWindow } from "electron";

const { app } = require("electron");
const { createMainWindow } = require("./window_setup");

function preventMultipleAppInstances() {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists({ win }: { win: BrowserWindow }) {
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
		app.quit();
	});
}

function createWindowOnActivate({ win }: { win: BrowserWindow }) {
	app.on("activate", () => {
		if (!win) {
			win = createMainWindow();
		}
	});
}

export function setupApp({ win }: { win: BrowserWindow }) {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ win: win });
	quitOnWindowsAllClosed();
	createWindowOnActivate({ win: win });
}
