import { app, Menu, MenuItemConstructorOptions } from "electron";
import { isMac, isWindows } from "../common/platform.js";
import { appMenuTemplate } from "./menu_app.js";
import { dockMenuTemplate } from "./menu_dock.js";
import { editMenuTemplate } from "./menu_edit.js";
import { fileMenuTemplate } from "./menu_file.js";
import { helpMenuTemplate } from "./menu_help.js";
import { viewMenuTemplate } from "./menu_view.js";
import { windowMenuTemplate } from "./menu_window.js";
import { i18n } from "./i18n.js";

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
			title: i18n("usertasks:open-file.label"),
			description: i18n("usertasks:open-file.description"),
		},
	]);
}

export function setupMenus(): void {
	setupMainMenu();
	setupDockMenu();
	setupUserTasksMenu();
}
