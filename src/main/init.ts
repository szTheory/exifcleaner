import { app, BrowserWindow } from "electron";
import unhandled from "electron-unhandled";
import packageJson from "../../package.json";
import { setupApp } from "./app_setup";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";

function setupErrorHandling(): void {
	unhandled();
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init(browserWindow: BrowserWindow | null): void {
	setupErrorHandling();
	setupContextMenu();
	setupDockEventHandlers();
	setupUserModelId();
	setupApp(browserWindow);
}
