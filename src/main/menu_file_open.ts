import { dialog, BrowserWindow, WebContents } from "electron";

export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

export function fileOpenClick(
	event: KeyboardEvent,
	focusedWindow: BrowserWindow,
	focusedWebContents: WebContents
) {
	dialog
		.showOpenDialog(focusedWindow, {
			properties: ["openFile", "multiSelections"]
		})
		.then(result => {
			if (result.filePaths) {
				focusedWindow.webContents.send(
					EVENT_FILE_OPEN_ADD_FILES,
					result.filePaths
				);
			}
		});
}

export function fileMenuOpenItem() {
	return {
		label: "Open…",
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick
	};
}
