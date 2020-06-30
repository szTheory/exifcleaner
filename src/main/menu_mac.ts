import { buildHelpSubmenu } from "./menu_help";
import { fileMenuOpenItem } from "./menu_file_open";
import { MenuItemConstructorOptions, app } from "electron";

export function buildMacOsTemplate(): MenuItemConstructorOptions[] {
	return [
		{
			label: app.getName(),
			submenu: [
				{
					role: "about"
				},
				{
					type: "separator"
				},
				{
					role: "services"
				},
				{
					type: "separator"
				},
				{
					role: "hide"
				},
				{
					role: "hideOthers"
				},
				{
					role: "unhide"
				},
				{
					type: "separator"
				},
				{
					role: "quit"
				}
			]
		},
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
