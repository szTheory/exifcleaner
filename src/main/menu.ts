import { buildDefaultOsTemplate } from "./menu_default";
import { buildMacOsTemplate } from "./menu_mac";
import { Menu, MenuItemConstructorOptions } from "electron";

const PLATFORM_MAC = "darwin";
function isMac(): boolean {
	return process.platform === PLATFORM_MAC;
}

function buildMenuTemplate(): MenuItemConstructorOptions[] {
	let menuTemplate = isMac() ? buildMacOsTemplate() : buildDefaultOsTemplate();

	return menuTemplate;
}

function buildMenu(): Menu {
	const menuTemplate = buildMenuTemplate();

	return Menu.buildFromTemplate(menuTemplate);
}

export function setupMenu(): void {
	const menu = buildMenu();

	Menu.setApplicationMenu(menu);
}
