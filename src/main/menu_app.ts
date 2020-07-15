import { MenuItemConstructorOptions, app } from "electron";
import { i18n } from "./i18n";

export function appMenuTemplate(): MenuItemConstructorOptions {
	return {
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
	};
}
