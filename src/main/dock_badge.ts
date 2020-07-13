import { BrowserWindow, app } from "electron";
import { isMac } from "../common/platform";
import { ipcMain } from "electron";

export function setupDockBadge() {
	ipcMain.on("files-added", (_event, arg) => {
		const filesCount = arg;

		if (isMac()) {
			if (!app.dock) {
				throw new Error("Could not get a handle on the Mac Dock");
			}
			app.dock.setBadge(filesCount);
		}
	});

	ipcMain.on("file-processed", (_event, _arg) => {
		if (isMac()) {
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
	});
}
