import { app } from "electron";
import type { BrowserWindow } from "electron";
import { restoreWindowAndFocus } from "../../infrastructure";
import { isMac, isWindows } from "../../common";
import { fileOpen } from "../file_open";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

interface OpenMinimizedParams {
	getWindow: () => BrowserWindow | null;
}

function openMinimizedIfAlreadyExists({
	getWindow,
}: OpenMinimizedParams): void {
	app.on("second-instance", (_event, argv) => {
		const browserWindow = getWindow();
		console.log(argv);
		if (isWindows() && argv.length > 0 && argv.includes("--open-file")) {
			fileOpen({ browserWindow });
			return;
		}

		restoreWindowAndFocus({ browserWindow });
	});
}

function quitOnWindowsAllClosed(): void {
	app.on("window-all-closed", () => {
		if (!isMac()) {
			app.quit();
		}
	});
}

interface SetupAppParams {
	getWindow: () => BrowserWindow | null;
	onQuit: () => void;
}

export function setupApp({ getWindow, onQuit }: SetupAppParams): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ getWindow });
	quitOnWindowsAllClosed();
	// Note: "activate" handler (re-create window on dock click) is in index.ts
	// because it needs to call the full init + setupMainWindow sequence
	app.on("will-quit", onQuit);
}
