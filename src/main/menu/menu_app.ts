import { type MenuItemConstructorOptions, BrowserWindow, app } from "electron";
import { i18n } from "../i18n";
import { isMac, IPC_CHANNELS } from "../../common";

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
				label: `${i18n("menu.app.settings")}\u2026`,
				accelerator: "CmdOrCtrl+,",
				click: () => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send(IPC_CHANNELS.SETTINGS_TOGGLE);
					}
				},
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
				label: isMac()
					? `${i18n("menu.app.quit")} ${app.getName()}`
					: i18n("menu.app.quit"),
				role: "quit",
			},
		],
	};
}
