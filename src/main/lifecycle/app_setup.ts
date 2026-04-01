import { app, BrowserWindow } from "electron";
import {
	currentBrowserWindow,
	restoreWindowAndFocus,
} from "../../infrastructure";
import { createMainWindow } from "../window/window_setup";
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

interface CreateWindowOnActivateParams {
	browserWindow: BrowserWindow | null;
}

function createWindowOnActivate({
	browserWindow,
}: CreateWindowOnActivateParams): void {
	app.on("activate", () => {
		browserWindow = currentBrowserWindow({ browserWindow });
		if (!browserWindow) {
			browserWindow = createMainWindow();
		}
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
	createWindowOnActivate({ browserWindow });
	app.on("will-quit", onQuit);
}
