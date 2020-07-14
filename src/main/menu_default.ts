import { MenuItemConstructorOptions } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { buildHelpSubmenu } from "./menu_help";

// Linux and Windows
export function buildDefaultOsTemplate(): MenuItemConstructorOptions[] {
	return [
		{
			role: "fileMenu",
			submenu: [
				fileMenuOpenItem(),
				{
					type: "separator",
				},
				{
					role: "quit",
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
			role: "help",
			submenu: buildHelpSubmenu(),
		},
	];
}
