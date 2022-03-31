import { app, BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { setupApp } from "./app_setup.js";
import { setupContextMenu } from "./context_menu.js";
import { setupDockEventHandlers } from "./dock.js";
import { preloadI18nStrings } from "../common/i18n.js";
import { setupI18nHandlers } from "../main/i18n.js";

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init(browserWindow: BrowserWindow | null): void {
	preloadI18nStrings();
	setupI18nHandlers();
	setupContextMenu();
	setupDockEventHandlers(browserWindow);
	setupUserModelId();
	setupApp(browserWindow);
}
