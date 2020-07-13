import { BrowserWindow, app } from "electron";
import { isMac } from "../common/platform";
import { ipcMain } from "electron";

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";

function updateDockFilesAdded(filesCount: number): void {
	if (!app.dock) {
		throw new Error("Could not get a handle on the Mac Dock");
	}
	app.dock.setBadge(filesCount.toString());
}

function updateDockRemovedFile(): void {
	if (!app.dock) {
		throw new Error("Could not get a handle on the Mac Dock");
	}
	const fileCount = parseInt(app.dock.getBadge());
	const newFileCount = fileCount - 1;
	const displayFileCount = newFileCount > 0 ? newFileCount.toString() : "";

	if (newFileCount <= 0 && !BrowserWindow.getFocusedWindow()) {
		app.dock.bounce("critical");
	}
	app.dock.setBadge(displayFileCount);
}

export function setupDockBadge() {
	ipcMain.on("files-added", (_event, arg) => {
		if (isMac()) {
			updateDockFilesAdded(arg);
		}
	});

	ipcMain.on("file-processed", (_event, _arg) => {
		if (isMac()) {
			updateDockRemovedFile();
		}
	});
}
