import { app, Menu, MenuItemConstructorOptions } from "electron";
import { isMac, isWindows } from "../common/platform";
import { appMenuTemplate } from "./menu_app";
import { dockMenuTemplate } from "./menu_dock";
import { editMenuTemplate } from "./menu_edit";
import { fileMenuTemplate } from "./menu_file";
import { helpMenuTemplate } from "./menu_help";
import { viewMenuTemplate } from "./menu_view";
import { windowMenuTemplate } from "./menu_window";

const APP_ARG_WINDOWS_TASK_OPEN_FILE = "--open-file";

function menuTemplate(): MenuItemConstructorOptions[] {
	return [
		...(isMac() ? [appMenuTemplate()] : []),
		fileMenuTemplate(),
		editMenuTemplate(),
		viewMenuTemplate(),
		windowMenuTemplate(),
		helpMenuTemplate(),
	];
}

function menu(): Menu {
	return Menu.buildFromTemplate(menuTemplate());
}

function dockMenu(): Menu {
	return Menu.buildFromTemplate(dockMenuTemplate());
}

function setupMainMenu(): void {
	Menu.setApplicationMenu(menu());
}

function setupDockMenu(): void {
	if (!isMac()) {
		return;
	}

	app.dock.setMenu(dockMenu());
}

function setupUserTasksMenu(): void {
	if (!isWindows()) {
		return;
	}

	app.setUserTasks([
		{
			program: process.execPath,
			arguments: APP_ARG_WINDOWS_TASK_OPEN_FILE,
			iconPath: process.execPath,
			iconIndex: 0,
			title: "Open file(s)…",
			description: "Remove metadata from selected files",
		},
	]);
}

export function setupMenus(): void {
	setupMainMenu();
	setupDockMenu();
	setupUserTasksMenu();
}
