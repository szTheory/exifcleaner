const { buildHelpSubmenu } = require("./menu_help");
const { appMenu } = require("electron-util");
const { fileMenuOpenItem } = require("./menu_file_open");

export function buildMacOsTemplate() {
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
