const { app } = require("electron");
const { createMainWindow } = require("./window_setup");

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
		app.quit();
	});
}

function createWindowOnActivate({ win }) {
	app.on("activate", () => {
		if (!win) {
			win = createMainWindow();
		}
	});
}

const setupApp = function({ win }) {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ win: win });
	quitOnWindowsAllClosed();
	createWindowOnActivate({ win: win });
};

module.exports = {
	setupApp
};
