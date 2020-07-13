import { BrowserWindow, app } from "electron";
import { isMac } from "../common/platform";
import { ipcMain } from "electron";

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";

export function setupDockEventHandlers() {
	ipcMain.on("files-added", (_event, filesCount) => {
		if (isMac()) {
			updateDockFilesAdded(filesCount);
		}
	});

	ipcMain.on("file-processed", (_event, _arg) => {
		if (isMac()) {
			updateDockRemovedFile();
		}
	});
}

function updateDockFilesAdded(filesCount: number): void {
	if (!app.dock) {
		throw new Error("Could not get a handle on the Mac Dock");
	}

	// update badge count
	app.dock.setBadge(filesCount.toString());
}

function updateDockRemovedFile(): void {
	if (!app.dock) {
		throw new Error("Could not get a handle on the Mac Dock");
	}

	const fileCount = parseInt(app.dock.getBadge());
	const newFileCount = fileCount - 1;
	const displayFileCount = newFileCount > 0 ? newFileCount.toString() : "";

	// update badge count
	app.dock.setBadge(displayFileCount);

	// bounce if done
	if (newFileCount <= 0 && !BrowserWindow.getFocusedWindow()) {
		app.dock.bounce("critical");
	}
}
