import { BrowserWindow, app } from "electron";
import url from "url";
import path from "path";
import { isDev } from "../common/env";
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

function urlForLoad() {
	if (isDev) {
		const port = process.env.ELECTRON_WEBPACK_WDS_PORT;
		if (!port) {
			throw "No Electron webpack WDS port set for dev. Try running `yarn run dev` instead for development mode.";
		}

		return `http://localhost:${port}`;
	} else {
		return url.format({
			pathname: path.join(__dirname, "index.html"),
			protocol: "file",
			slashes: true,
		});
	}
}

function mainWindowLoadUrl(browserWindow: BrowserWindow) {
	browserWindow.loadURL(urlForLoad());
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
		webPreferences: { nodeIntegration: true },
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
