import { app, BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { setupApp } from "./app_setup";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";
import { preloadI18nStrings } from "../common/i18n";
import { setupI18nHandlers } from "../main/i18n";

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
