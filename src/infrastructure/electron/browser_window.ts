import { BrowserWindow } from "electron";

interface BrowserWindowParam {
	browserWindow: BrowserWindow | null | undefined;
}

export function currentBrowserWindow({
	browserWindow,
}: BrowserWindowParam): BrowserWindow | null {
	if (!browserWindow) {
		browserWindow = BrowserWindow.getAllWindows()[0] ?? null;
	}

	return browserWindow;
}

export function defaultBrowserWindow({
	browserWindow,
}: BrowserWindowParam): BrowserWindow {
	if (!browserWindow) {
		browserWindow = currentBrowserWindow({ browserWindow });
		if (!browserWindow) {
			throw new Error(
				"Could not load file open menu because browser window was not initialized.",
			);
		}
	}

	return browserWindow;
}

export function restoreWindowAndFocus({
	browserWindow,
}: BrowserWindowParam): void {
	browserWindow = defaultBrowserWindow({ browserWindow });
	if (browserWindow.isMinimized()) {
		browserWindow.restore();
	}
	browserWindow.show();
	browserWindow.focus();
}
