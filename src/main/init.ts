import unhandled from "electron-unhandled";
import packageJson from "../../package.json";
import { app, BrowserWindow } from "electron";
import { setupContextMenu } from "./context_menu";
import { setupApp } from "./app_setup";
import { setupDockBadge } from "./dock_badge";

function setupErrorHandling(): void {
	unhandled();
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init({ win }: { win: BrowserWindow | null }): void {
	setupErrorHandling();
	setupContextMenu();
	setupDockBadge();
	setupUserModelId();
	setupApp({ win: win });
}
