const { app } = require("electron");
const unhandled = require("electron-unhandled");
const debug = require("electron-debug");
const contextMenu = require("electron-context-menu");
const packageJson = require("../../package.json");
// const { setupAutoUpdate } = require("./auto_update");
const { setupApp } = require("./app_setup");

function setupErrorHandling() {
	unhandled();
}

function setupDevTools() {
	debug();
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
	setupDevTools();
	setupContextMenu();
	setupUserModelId();
	// Disable auto update for now. Code signing is a pain in
	// the butt and I don't want to pay Microsoft and Apple for it.
	// setupAutoUpdate();
	setupApp({ win: win });
};

module.exports = {
	init
};
