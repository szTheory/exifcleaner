import { buildDefaultOsTemplate as defaultOsMenuTemplate } from "./menu_default";
import { macOsMenuTemplate } from "./menu_mac";
import { isMac } from "../common/platform";
import { app, Menu, MenuItemConstructorOptions } from "electron";
import { dockMenuTemplate } from "./menu_dock";

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
