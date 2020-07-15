import { MenuItemConstructorOptions } from "electron";
import { i18n } from "./i18n";

export function viewMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.view.name"),
		role: "viewMenu",
	};
}
