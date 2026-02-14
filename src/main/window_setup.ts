import { BrowserWindow, app } from "electron";
import path from "path";
import { isMac, isWindows } from "../common/platform";
import { iconPath } from "../common/resources";

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

function setupMainWindowClose(browserWindow: BrowserWindow) {
	browserWindow.on("closed", () => {
		// on Mac, the convention is to leave the app
		// open even when all windows are closed. so that for
		// example they can relaunch the app from the dock
		// or still use the drag to dock features
		if (!isMac()) {
			// quit application on window close
			app.quit();
		}
	});
}

function showWindowOnReady(browserWindow: BrowserWindow) {
	browserWindow.once("ready-to-show", () => {
		browserWindow.show();
		browserWindow.focus();
	});
}

// On Windows, stop flashing the frame once the window comes into focus.
// More: https://www.electronjs.org/docs/tutorial/windows-taskbar#flash-frame
function windowsStopFlashingFrameOnFocus(browserWindow: BrowserWindow) {
	if (!isWindows()) {
		return;
	}

	browserWindow.once("focus", () => browserWindow.flashFrame(false));
}

function mainWindowLoadUrl(browserWindow: BrowserWindow) {
	if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
		browserWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	} else {
		browserWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
	}
}

const WINDOW_BACKGROUND_COLOR = "#F5F6F8";

export function createMainWindow(): BrowserWindow {
	let options = {
		title: app.name,
		show: false,
		width: DEFAULT_WINDOW_WIDTH,
		height: DEFAULT_WINDOW_HEIGHT + 25,
		minWidth: DEFAULT_WINDOW_WIDTH,
		minHeight: DEFAULT_WINDOW_HEIGHT + 25,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, "../preload/index.js"),
		},
		//set specific background color eliminate white flicker on content load
		backgroundColor: WINDOW_BACKGROUND_COLOR,
		icon: iconPath(),
	};

	return new BrowserWindow(options);
}

export function setupMainWindow(browserWindow: BrowserWindow): void {
	setupMainWindowClose(browserWindow);
	// load URL before showing the window to avoid flash of unloaded content
	mainWindowLoadUrl(browserWindow);
	showWindowOnReady(browserWindow);
	windowsStopFlashingFrameOnFocus(browserWindow);
}
