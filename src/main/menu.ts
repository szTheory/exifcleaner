import { app, Menu, MenuItemConstructorOptions } from "electron";
import { isMac } from "../common/platform";
import { buildDefaultOsTemplate as defaultOsMenuTemplate } from "./menu_default";
import { dockMenuTemplate } from "./menu_dock";
import { macOsMenuTemplate } from "./menu_mac";

function menuTemplate(): MenuItemConstructorOptions[] {
	return isMac() ? macOsMenuTemplate() : defaultOsMenuTemplate();
}

function menu(): Menu {
	return Menu.buildFromTemplate(menuTemplate());
}

function dockMenu(): Menu {
	return Menu.buildFromTemplate(dockMenuTemplate());
}

export function setupMenu(): void {
	Menu.setApplicationMenu(menu());
	app.dock.setMenu(dockMenu());
}
