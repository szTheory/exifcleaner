import { dialog, BrowserWindow } from "electron";
import {
	defaultBrowserWindow,
	restoreWindowAndFocus,
} from "../infrastructure/electron/browser_window";

import { EVENT_FILE_OPEN_ADD_FILES } from "../domain/ipc_channels";
export { EVENT_FILE_OPEN_ADD_FILES };

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
					EVENT_FILE_OPEN_ADD_FILES,
					result.filePaths,
				);
			}
		});
}
