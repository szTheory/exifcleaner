import { app, BrowserWindow } from "electron";
import { setupContextMenu } from "./context_menu";
import unhandled from "electron-unhandled";

import packageJson from "../../package.json";

import { setupApp } from "./app_setup";

function setupErrorHandling(): void {
	unhandled();
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init({ win }: { win: BrowserWindow | null }): void {
	setupErrorHandling();
	setupContextMenu();
	setupUserModelId();
	setupApp({ win: win });
}
