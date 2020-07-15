import { MenuItemConstructorOptions, app } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { buildHelpSubmenu } from "./menu_help";
import { i18n } from "./i18n";

export function macOsMenuTemplate(): MenuItemConstructorOptions[] {
	return [
		{
			label: app.getName(),
			submenu: [
				{
					label: `${i18n("menu.app.about")}${app.getName()}`,
					role: "about",
				},
				{
					type: "separator",
				},
				{
					label: i18n("menu.app.services"),
					role: "services",
				},
				{
					type: "separator",
				},
				{
					label: `${i18n("menu.app.hide")} ${app.getName()}`,
					role: "hide",
				},
				{
					label: i18n("menu.app.hide-others"),
					role: "hideOthers",
				},
				{
					label: i18n("menu.app.show-all"),
					role: "unhide",
				},
				{
					type: "separator",
				},
				{
					label: i18n("menu.app.quit"),
					role: "quit",
				},
			],
		},
		{
			role: "fileMenu",
			type: "submenu",
			submenu: [
				fileMenuOpenItem(),
				{
					type: "separator",
				},
				{
					label: i18n("menu.file.close"),
					role: "close",
				},
			],
		},
		{
			role: "editMenu",
		},
		{
			role: "viewMenu",
		},
		{
			role: "windowMenu",
		},
		{
			role: "help",
			submenu: buildHelpSubmenu(),
		},
	];
}
