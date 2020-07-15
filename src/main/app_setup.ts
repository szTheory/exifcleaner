import { app, BrowserWindow } from "electron";
import {
	currentBrowserWindow,
	restoreWindowAndFocus,
} from "../common/browser_window";
import { createMainWindow } from "./window_setup";
import { isWindows } from "../common/platform";
import { fileOpen } from "./file_open";

function preventMultipleAppInstances(): void {
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	}
}

function openMinimizedIfAlreadyExists(
	browserWindow: BrowserWindow | null
): void {
	app.on(
		"second-instance",
		(_event: Event, argv: string[], _workingDirectory: string) => {
			console.log(argv);
			if (isWindows() && argv.length > 0 && argv.includes("--open-file")) {
				fileOpen(browserWindow);
				return;
			}

			restoreWindowAndFocus(browserWindow);
		}
	);
}

function quitOnWindowsAllClosed(): void {
	app.on("window-all-closed", () => {
		app.quit();
	});
}

function createWindowOnActivate(browserWindow: BrowserWindow | null): void {
	app.on("activate", () => {
		browserWindow = currentBrowserWindow(browserWindow);
		if (!browserWindow) {
			browserWindow = createMainWindow();
		}
	});
}

export function setupApp(browserWindow: BrowserWindow | null): void {
	preventMultipleAppInstances();
	openMinimizedIfAlreadyExists(browserWindow);
	quitOnWindowsAllClosed();
	createWindowOnActivate(browserWindow);
}
