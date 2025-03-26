import { BrowserWindow } from "electron";

export function currentBrowserWindow(
	browserWindow: BrowserWindow | null | undefined
): BrowserWindow | null {
	if (!browserWindow) {
		browserWindow = BrowserWindow.getAllWindows()[0];
	}

	return browserWindow;
}

export function defaultBrowserWindow(
	browserWindow: BrowserWindow | null | undefined
): BrowserWindow {
	if (!browserWindow) {
		browserWindow = currentBrowserWindow(browserWindow);
		if (!browserWindow) {
			throw new Error(
				"Could not load file open menu because browser window was not initialized."
			);
		}
	}

	return browserWindow;
}

export function restoreWindowAndFocus(
	browserWindow: BrowserWindow | null | undefined
): void {
	browserWindow = defaultBrowserWindow(browserWindow);
	if (browserWindow.isMinimized()) {
		browserWindow.restore();
	}
	browserWindow.show();
	browserWindow.focus();
}
