import unhandled from "electron-unhandled";
import packageJson from "../../package.json";
import { app, BrowserWindow } from "electron";
import { setupContextMenu } from "./context_menu";
import { setupApp } from "./app_setup";
import { setupDockEventHandlers } from "./dock";

function setupErrorHandling(): void {
	unhandled();
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init({ win }: { win: BrowserWindow | null }): void {
	setupErrorHandling();
	setupContextMenu();
	setupDockEventHandlers();
	setupUserModelId();
	setupApp({ win: win });
}
