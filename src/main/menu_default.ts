import { MenuItemConstructorOptions } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { buildHelpSubmenu } from "./menu_help";
import { i18n } from "./i18n";

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
					label: i18n("filemenu.quit"),
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
