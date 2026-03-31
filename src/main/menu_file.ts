import { type MenuItemConstructorOptions, BrowserWindow } from "electron";
import { i18n } from "./i18n";
import { fileMenuOpenItem } from "./menu_file_open";
import { isMac } from "../common/platform";
import { IPC_CHANNELS } from "../common/ipc_channels";

export function fileMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.file.name"),
		role: "fileMenu",
		type: "submenu",
		submenu: [
			fileMenuOpenItem(),
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
