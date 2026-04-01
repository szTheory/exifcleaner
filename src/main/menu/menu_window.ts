import type { MenuItemConstructorOptions } from "electron";
import { i18n } from "../i18n";
import { isMac } from "../../common";

export function windowMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n({ key: "menu.window.name" }),
		submenu: [
			{
				label: isMac()
					? i18n({ key: "menu.window.minimize-mac" })
					: i18n({ key: "menu.window.minimize" }),
				role: "minimize",
			},
			{
				label: isMac()
					? i18n({ key: "menu.window.zoom-mac" })
					: i18n({ key: "menu.window.zoom" }),
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
			label: i18n({ key: "menu.window.front" }),
			role: "front",
		},
		{ type: "separator" },
		{
			label: i18n({ key: "menu.window.window" }),
			role: "window",
		},
	];
}

function defaultSubmenu(): MenuItemConstructorOptions[] {
	return [
		{
			label: i18n({ key: "menu.window.close" }),
			role: "close",
		},
	];
}
