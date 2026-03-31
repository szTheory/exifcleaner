import { dialog, BrowserWindow } from "electron";
import { defaultBrowserWindow, restoreWindowAndFocus } from "../infrastructure";
import { IPC_CHANNELS } from "../common";

export function fileOpen(
	browserWindow: BrowserWindow | undefined | null,
): void {
	browserWindow = defaultBrowserWindow(browserWindow);
	restoreWindowAndFocus(browserWindow);

	dialog
		.showOpenDialog(browserWindow, {
			properties: ["openFile", "multiSelections"],
		})
		.then((result) => {
			if (result.filePaths) {
				defaultBrowserWindow(browserWindow).webContents.send(
					IPC_CHANNELS.FILE_OPEN_ADD_FILES,
					result.filePaths,
				);
			}
		});
}
