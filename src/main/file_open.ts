import { dialog, BrowserWindow } from "electron";
import { defaultBrowserWindow, restoreWindowAndFocus } from "../infrastructure";
import { IPC_CHANNELS } from "../common";

interface FileOpenParams {
	browserWindow: BrowserWindow | undefined | null;
}

export function fileOpen({ browserWindow }: FileOpenParams): void {
	const win = defaultBrowserWindow({ browserWindow });
	restoreWindowAndFocus({ browserWindow: win });

	dialog
		.showOpenDialog(win, {
			properties: ["openFile", "multiSelections"],
		})
		.then((result) => {
			if (result.filePaths) {
				defaultBrowserWindow({ browserWindow: win }).webContents.send(
					IPC_CHANNELS.FILE_OPEN_ADD_FILES,
					result.filePaths,
				);
			}
		});
}
