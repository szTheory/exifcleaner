import {
	dialog,
	BrowserWindow,
	MenuItemConstructorOptions,
	MenuItem,
	KeyboardEvent,
} from "electron";

export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

export function fileOpenClick(
	_menuItem: MenuItem,
	browserWindow: BrowserWindow | undefined,
	_event: KeyboardEvent
): void {
	if (!browserWindow) {
		throw new Error(
			"Could not load file open menu because browser window was not initialized."
		);
	}

	dialog
		.showOpenDialog(browserWindow, {
			properties: ["openFile", "multiSelections"],
		})
		.then((result) => {
			if (result.filePaths) {
				browserWindow.webContents.send(
					EVENT_FILE_OPEN_ADD_FILES,
					result.filePaths
				);
			}
		});
}

export function fileMenuOpenItem(): MenuItemConstructorOptions {
	return {
		label: "Open…",
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick,
	};
}
