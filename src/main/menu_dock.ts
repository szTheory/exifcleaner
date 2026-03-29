import { type MenuItemConstructorOptions, BrowserWindow } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { i18n } from "./i18n";
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";

export function dockMenuTemplate(): MenuItemConstructorOptions[] {
	return [
		fileMenuOpenItem(),
		{
			label: `${i18n("menu.app.settings")}\u2026`,
			click: () => {
				const win = BrowserWindow.getAllWindows()[0];
				if (win) {
					win.show();
					win.webContents.send(IPC_CHANNELS.SETTINGS_TOGGLE);
				}
			},
		},
	];
}
