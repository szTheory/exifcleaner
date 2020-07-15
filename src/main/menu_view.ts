import { MenuItemConstructorOptions } from "electron";
import { i18n } from "./i18n";

export function viewMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.view.name"),
		submenu: [
			{
				label: i18n("menu.view.toggle-dev-tools"),
				role: "toggleDevTools",
			},
			{ type: "separator" },
			{
				label: i18n("menu.view.zoom-reset"),
				role: "resetZoom",
			},
			{
				label: i18n("menu.view.zoom-in"),
				role: "zoomIn",
			},
			{
				label: i18n("menu.view.zoom-out"),
				role: "zoomOut",
			},
			{ type: "separator" },
			{
				label: i18n("menu.view.toggle-full-screen"),
				role: "togglefullscreen",
			},
		],
	};
}
