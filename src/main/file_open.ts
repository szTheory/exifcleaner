import { dialog, BrowserWindow } from "electron";
import {
	defaultBrowserWindow,
	restoreWindowAndFocus,
} from "../common/browser_window.js";

export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

export function fileOpen(
	browserWindow: BrowserWindow | undefined | null
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
					result.filePaths
				);
			}
		});
}
