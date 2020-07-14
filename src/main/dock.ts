import { app } from "electron";
import { isMac } from "../common/platform";
import { ipcMain } from "electron";

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";
export const EVENT_ALL_FILES_PROCESSED = "all-files-processed";

export function setupDockEventHandlers(): void {
	if (isMac()) {
		ipcMain.on(EVENT_FILES_ADDED, (_event, filesCount) => {
			// set counter when files added
			updateDockFilesAdded(filesCount);
		});

		ipcMain.on(EVENT_FILE_PROCESSED, (_event, _arg) => {
			// decrement counter when file finishes processing
			updateDockRemovedFile();
		});

		ipcMain.on(EVENT_ALL_FILES_PROCESSED, (_event, _arg) => {
			// bounce when done processing all files
			updateDockBounce();
		});
	}
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
}

function updateDockBounce(): void {
	app.dock.bounce("critical");
}
