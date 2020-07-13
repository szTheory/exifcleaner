import { BrowserWindow, app } from "electron";
import { isMac } from "../common/platform";
import { ipcMain } from "electron";

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";

export function setupDockEventHandlers(): void {
	if (isMac()) {
		ipcMain.on(EVENT_FILES_ADDED, (_event, filesCount) => {
			updateDockFilesAdded(filesCount);
		});

		ipcMain.on(EVENT_FILE_PROCESSED, (_event, _arg) => {
			updateDockRemovedFile();
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

	// bounce if done
	if (newFileCount <= 0 && !BrowserWindow.getFocusedWindow()) {
		app.dock.bounce("critical");
	}
}
