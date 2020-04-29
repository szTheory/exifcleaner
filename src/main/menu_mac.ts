import { buildHelpSubmenu } from "./menu_help";
import { appMenu } from "electron-util";
import { fileMenuOpenItem } from "./menu_file_open";
import { MenuItemConstructorOptions } from "electron";

export function buildMacOsTemplate(): MenuItemConstructorOptions[] {
	return [
		appMenu([
			// No preferences menu for now
			// {
			// 	label: "Preferences…",
			// 	accelerator: "Command+,",
			// 	click() {
			// 		showPreferences();
			// 	}
			// }
		]),
		{
			role: "fileMenu",
			type: "submenu",
			submenu: [
				fileMenuOpenItem(),
				{
					type: "separator"
				},
				{
					role: "close"
				}
			]
		},
		{
			role: "editMenu"
		},
		{
			role: "viewMenu"
		},
		{
			role: "windowMenu"
		},
		{
			role: "help",
			submenu: buildHelpSubmenu()
		}
	];
}
