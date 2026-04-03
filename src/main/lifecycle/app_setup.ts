import { app } from "electron";
import type { BrowserWindow } from "electron";
import { restoreWindowAndFocus } from "../../infrastructure";
import { isWindows } from "../../common";
import { fileOpen } from "../file_open";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

interface OpenMinimizedParams {
	browserWindow: BrowserWindow | null;
}

function openMinimizedIfAlreadyExists({
	browserWindow,
}: OpenMinimizedParams): void {
	app.on("second-instance", (_event, argv) => {
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
		app.quit();
	});
}

interface SetupAppParams {
	browserWindow: BrowserWindow | null;
	onQuit: () => void;
}

export function setupApp({ browserWindow, onQuit }: SetupAppParams): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists({ browserWindow });
	quitOnWindowsAllClosed();
	// Note: "activate" handler (re-create window on dock click) is in index.ts
	// because it needs to call the full init + setupMainWindow sequence
	app.on("will-quit", onQuit);
}
