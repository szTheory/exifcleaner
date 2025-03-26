import { MenuItemConstructorOptions } from "electron";
import { i18n } from "./i18n";
import { fileMenuOpenItem } from "./menu_file_open";
import { isMac } from "../common/platform";

export function fileMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.file.name"),
		role: "fileMenu",
		type: "submenu",
		submenu: [
			fileMenuOpenItem(),
			{
				type: "separator",
			},
			fileQuitTemplate(),
		],
	};
}

function fileQuitTemplate(): MenuItemConstructorOptions {
	return isMac()
		? {
				label: i18n("menu.file.close"),
				role: "close",
		  }
		: {
				label: i18n("menu.file.quit"),
				role: "quit",
		  };
}
