import {
	dialog,
	BrowserWindow,
	MenuItemConstructorOptions,
	MenuItem,
	KeyboardEvent,
} from "electron";
import { defaultBrowserWindow } from "../common/browser_window";

export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

export function fileMenuOpenItem(): MenuItemConstructorOptions {
	return {
		label: "Open…",
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick,
	};
}

function fileOpenClick(
	_menuItem: MenuItem,
	browserWindow: BrowserWindow | undefined,
	_event: KeyboardEvent
): void {
	browserWindow = defaultBrowserWindow(browserWindow);
	if (browserWindow.isMinimized()) {
		browserWindow.restore();
	}
	browserWindow.show();
	browserWindow.focus();

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
