import { BrowserWindow, app } from "electron";
import { is } from "electron-util";
import url from "url";
import path from "path";

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

function setupMainWindowClose({ win }: { win: BrowserWindow }) {
	win.on("closed", () => {
		// on Mac, the convention is to leave the app
		// open even when all windows are closed. so that for
		// example they can relaunch the app from the dock
		// or still use the drag to dock features
		if (!is.macos) {
			// quit application on window close
			app.quit();
		}
	});
}

function showWindowOnReady({ win }: { win: BrowserWindow }) {
	win.once("ready-to-show", () => {
		win.show();
		win.focus();
	});
}

function urlForLoad() {
	if (is.development) {
		const port = process.env.ELECTRON_WEBPACK_WDS_PORT;
		if (!port) {
			throw "No Electron webpack WDS port set for dev. Try running `yarn run dev` instead for development mode.";
		}

		return `http://localhost:${port}`;
	} else {
		return url.format({
			pathname: path.join(__dirname, "index.html"),
			protocol: "file",
			slashes: true
		});
	}
}

function mainWindowLoadUrl({ win }: { win: BrowserWindow }) {
	const url = urlForLoad();

	win.loadURL(url);
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
		backgroundColor: WINDOW_BACKGROUND_COLOR
	};

	if (is.linux) {
		options = Object.assign({}, options, {
			icon: path.join(__dirname, "..", "..", "exifcleaner.png")
		});
	}

	return new BrowserWindow(options);
}

export function setupMainWindow({ win }: { win: BrowserWindow }): void {
	setupMainWindowClose({ win: win });
	// load URL before showing the window to avoid flash of unloaded content
	mainWindowLoadUrl({ win: win });
	showWindowOnReady({ win: win });
}
