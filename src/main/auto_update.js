const { is } = require("electron-util");
const { autoUpdater } = require("electron-updater");
const logger = require("electron-log");

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

const setupAutoUpdate = function() {
	if (is.development) {
		return;
	}

	setupLogging();
	checkPeriodically();
	checkNow();
};

module.exports = {
	setupAutoUpdate
};
