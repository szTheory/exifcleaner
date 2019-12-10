const { app } = require("electron");

export const setupAppCallbacks = function() {
	app.on("second-instance", () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) {
				mainWindow.restore();
			}

			mainWindow.show();
		}
	});

	app.on("window-all-closed", () => {
		if (!is.macos) {
			app.quit();
		}
	});

	app.on("activate", () => {
		if (!mainWindow) {
			mainWindow = createMainWindow();
		}
	});
};
