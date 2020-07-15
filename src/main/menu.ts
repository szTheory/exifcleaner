import { app, Menu, MenuItemConstructorOptions } from "electron";
import { isMac } from "../common/platform";
import { dockMenuTemplate } from "./menu_dock";
import { viewMenuTemplate } from "./menu_view";
import { editMenuTemplate } from "./menu_edit";
import { helpMenuTemplate } from "./menu_help";
import { windowMenuTemplate } from "./menu_window";
import { fileMenuTemplate } from "./menu_file";
import { appMenuTemplate } from "./menu_app";

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

export function setupMenu(): void {
	Menu.setApplicationMenu(menu());
	if (isMac()) app.dock.setMenu(dockMenu());
}
