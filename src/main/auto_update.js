import { is } from "electron-util";
import { autoUpdater } from "electron-updater";
import logger from "electron-log";

const FOUR_HOURS = 1000 * 60 * 60 * 4;

function setupLogging() {
	autoUpdater.logger = logger;
	autoUpdater.logger.transports.file.level = "info";
}

function checkPeriodically() {
	setInterval(() => {
		checkNow();
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
