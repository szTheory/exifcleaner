import type { MenuItemConstructorOptions } from "electron";
import { i18n } from "../i18n";
import { isMac } from "../../common";

export function editMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n({ key: "menu.edit.name" }),
		submenu: [
			{
				label: i18n({ key: "menu.edit.copy" }),
				role: "copy",
			},
			{
				label: i18n({ key: "menu.edit.select-all" }),
				role: "selectAll",
			},
			...(isMac() ? macSubmenu() : []),
		],
	};
}

function macSubmenu(): MenuItemConstructorOptions[] {
	return [
		{
			type: "separator",
		},
		{
			label: i18n({ key: "menu.edit.speech" }),
			submenu: [
				{
					label: i18n({ key: "menu.edit.speech.start-speaking" }),
					role: "startSpeaking",
				},
				{
					label: i18n({ key: "menu.edit.speech.stop-speaking" }),
					role: "stopSpeaking",
				},
			],
		},
	];
}
