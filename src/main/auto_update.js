import { is } from "electron-util";
import { autoUpdater } from "electron-updater";

const FOUR_HOURS = 1000 * 60 * 60 * 4;

function setupLogging() {
	// LOGGING
	autoUpdater.logger = require("electron-log");
	autoUpdater.logger.transports.file.level = "info";
}

function checkPeriodically() {
	setInterval(() => {
		autoUpdater.checkForUpdates();
	}, FOUR_HOURS);
}

function checkNow() {
	autoUpdater.checkForUpdates();
}

export const setupAutoUpdate = function() {
	if (is.development) {
		return;
	}

	setupLogging();
	checkPeriodically();
	checkNow();
};
