import { app } from "electron";
const unhandled = require("electron-unhandled");
const debug = require("electron-debug");
const contextMenu = require("electron-context-menu");
const packageJson = require("../../package.json");
import { setupAutoUpdate } from "./auto_update";
import { setupApp } from "./app_setup";

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

export const init = function({ win }) {
	setupErrorHandling();
	setupDevTools();
	setupContextMenu();
	setupUserModelId();
	setupAutoUpdate();
	setupApp({ win: win });
};
