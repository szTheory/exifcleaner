import {
	dialog,
	BrowserWindow,
	MenuItemConstructorOptions,
	MenuItem,
	KeyboardEvent,
} from "electron";

export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

export function fileMenuOpenItem(): MenuItemConstructorOptions {
	return {
		label: "Open…",
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick,
	};
}

function defaultBrowserWindow(
	browserWindow: BrowserWindow | undefined
): BrowserWindow {
	if (!browserWindow) {
		const firstBrowserWindow = BrowserWindow.getAllWindows()[0];
		if (!firstBrowserWindow) {
			throw new Error(
				"Could not load file open menu because browser window was not initialized."
			);
		}
		browserWindow = firstBrowserWindow;
	}

	return browserWindow;
}

function fileOpenClick(
	_menuItem: MenuItem,
	browserWindow: BrowserWindow | undefined,
	_event: KeyboardEvent
): void {
	browserWindow = defaultBrowserWindow(browserWindow);
	browserWindow.show();

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
