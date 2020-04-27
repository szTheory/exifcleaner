const { app } = require("electron");
const unhandled = require("electron-unhandled");
const contextMenu = require("electron-context-menu");
const packageJson = require("../../package.json");
const { setupApp } = require("./app_setup");

function setupErrorHandling() {
	unhandled();
}

// context menu (copy/paste/etc)
function setupContextMenu() {
	contextMenu();
}

function setupUserModelId() {
	app.setAppUserModelId(packageJson.build.appId);
}

const init = function({ win }) {
	setupErrorHandling();
	setupContextMenu();
	setupUserModelId();
	setupApp({ win: win });
};

module.exports = {
	init
};
