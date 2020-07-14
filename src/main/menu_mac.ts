import { MenuItemConstructorOptions, app } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { buildHelpSubmenu } from "./menu_help";

export function macOsMenuTemplate(): MenuItemConstructorOptions[] {
	return [
		{
			label: app.getName(),
			submenu: [
				{
					role: "about",
				},
				{
					type: "separator",
				},
				{
					role: "services",
				},
				{
					type: "separator",
				},
				{
					role: "hide",
				},
				{
					role: "hideOthers",
				},
				{
					role: "unhide",
				},
				{
					type: "separator",
				},
				{
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
