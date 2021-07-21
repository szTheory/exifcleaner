import { MenuItemConstructorOptions } from "electron";
import { i18n } from "./i18n.js";
import { isMac } from "../common/platform.js";

export function windowMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.window.name"),
		submenu: [
			{
				label: isMac()
					? i18n("menu.window.minimize-mac")
					: i18n("menu.window.minimize"),
				role: "minimize",
			},
			{
				label: isMac()
					? i18n("menu.window.zoom-mac")
					: i18n("menu.window.zoom"),
				role: "zoom",
			},
			...(isMac() ? macSubmenu() : defaultSubmenu()),
		],
	};
}

function macSubmenu(): MenuItemConstructorOptions[] {
	return [
		{ type: "separator" },
		{
			label: i18n("menu.window.front"),
			role: "front",
		},
		{ type: "separator" },
		{
			label: i18n("menu.window.window"),
			role: "window",
		},
	];
}

function defaultSubmenu(): MenuItemConstructorOptions[] {
	return [
		{
			label: i18n("menu.window.close"),
			role: "close",
		},
	];
}
