import { app, ipcMain, BrowserWindow, nativeImage } from "electron";
import { defaultBrowserWindow } from "../common/browser_window";
import { isMac, isWindows } from "../common/platform";
import { checkmarkPath } from "../common/resources";

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";
export const EVENT_ALL_FILES_PROCESSED = "all-files-processed";

let batchCount = 0;
let remainingCount = 0;

export function setupDockEventHandlers(
	browserWindow: BrowserWindow | null
): void {
	ipcMain.on(EVENT_FILES_ADDED, (_event, filesCount) => {
		storeBatchCount(filesCount);

		updateDockAndProgressBar(browserWindow);
		windowsOverlayIcon(browserWindow, false);
	});

	ipcMain.on(EVENT_FILE_PROCESSED, (_event, _arg) => {
		storeFilesCount(remainingCount - 1);

		// if there are none remaining, let the all finished
		// event take care of it so we don't double up
		if (remainingCount > 0) {
			updateDockAndProgressBar(browserWindow);
		}
	});

	ipcMain.on(EVENT_ALL_FILES_PROCESSED, (_event, _arg) => {
		storeBatchCount(0);

		updateDockAndProgressBar(browserWindow);
		updateDockBounce(browserWindow);
		windowsFlashFrame(browserWindow);
		windowsOverlayIcon(browserWindow, true);
	});
}

function storeBatchCount(filesCount: number) {
	batchCount = filesCount;
	storeFilesCount(batchCount);
}

function storeFilesCount(filesCount: number): void {
	remainingCount = filesCount > 0 ? filesCount : 0;
}

function updateDockAndProgressBar(browserWindow: BrowserWindow | null) {
	updateDockCount();
	updateProgressBar(browserWindow);
}

function updateDockCount(): void {
	if (!isMac()) {
		return;
	}

	if (!app.dock) {
		throw new Error("Could not get a handle on the Mac Dock");
	}

	// update badge count
	app.dock.setBadge(remainingCount > 0 ? remainingCount.toString() : "");
}

function updateProgressBar(browserWindow: BrowserWindow | null): void {
	browserWindow = defaultBrowserWindow(null);
	let ratio =
		remainingCount <= 0 ? -1 : (batchCount - remainingCount) / batchCount;

	browserWindow.setProgressBar(ratio);
}

function updateDockBounce(browserWindow: BrowserWindow | null): void {
	if (!isMac()) {
		return;
	}
	browserWindow = defaultBrowserWindow(null);
	if (browserWindow.isFocused()) {
		// don't bother if the window is already focused
		return;
	}

	app.dock.bounce("critical");
}

// Window is flashed to inform the user that the window requires
// attention but that it does not currently have the keyboard focus.
// https://www.electronjs.org/docs/tutorial/windows-taskbar#flash-frame
function windowsFlashFrame(browserWindow: BrowserWindow | null): void {
	if (!isWindows()) {
		return;
	}
	browserWindow = defaultBrowserWindow(browserWindow);
	if (browserWindow.isFocused()) {
		// don't bother if the window is already focused
		return;
	}

	browserWindow.flashFrame(true);
}

function windowsOverlayIcon(
	browserWindow: BrowserWindow | null,
	enabled: boolean
): void {
	if (!isWindows()) {
		return;
	}
	browserWindow = defaultBrowserWindow(browserWindow);

	const icon = enabled ? nativeImage.createFromPath(checkmarkPath()) : null;

	browserWindow.setOverlayIcon(icon, "Finished processing all files");
}
