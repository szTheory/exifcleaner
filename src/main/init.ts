import { app, BrowserWindow } from "electron";
import unhandled from "electron-unhandled";
import packageJson from "../../package.json";
import { setupApp } from "./app_setup";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";
import { preloadI18nStrings } from "../common/i18n";

function setupErrorHandling(): void {
	unhandled(); //handle "unhandled" exceptions
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init(browserWindow: BrowserWindow | null): void {
	preloadI18nStrings();
	setupErrorHandling();
	setupContextMenu();
	setupDockEventHandlers(browserWindow);
	setupUserModelId();
	setupApp(browserWindow);
}
