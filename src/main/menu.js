const { Menu } = require("electron");
const { is } = require("electron-util");
import { buildDebugSubmenu } from "./menu_debug";
import { buildDefaultOsTemplate } from "./menu_default";
import { buildMacOsTemplate } from "./menu_mac";

function buildMenuTemplate() {
	let menuTemplate =
		process.platform === "darwin"
			? buildMacOsTemplate()
			: buildDefaultOsTemplate();

	if (is.development) {
		menuTemplate.push({
			label: "Debug",
			submenu: buildDebugSubmenu()
		});
	}

	return menuTemplate;
}

function buildMenu() {
	const menuTemplate = buildMenuTemplate();

	return Menu.buildFromTemplate(menuTemplate);
}

export function setupMenu() {
	Menu.setApplicationMenu(buildMenu());
}
