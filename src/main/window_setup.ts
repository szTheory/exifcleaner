import { BrowserWindow, app } from "electron";
const { is } = require("electron-util");
const url = require("url");
const path = require("path");

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

function setupMainWindowClose({ win }: { win: BrowserWindow }) {
	win.on("closed", () => {
		// Close application on window quit
		// (for Mac File -> Close Window)
		app.quit();
	});
}

function showWindowOnReady({ win }: { win: BrowserWindow }) {
	win.once("ready-to-show", () => {
		win.show();
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

export function createMainWindow(): BrowserWindow {
	let options = {
		title: app.name,
		show: false,
		width: DEFAULT_WINDOW_WIDTH,
		height: DEFAULT_WINDOW_HEIGHT + 25,
		minWidth: DEFAULT_WINDOW_WIDTH,
		minHeight: DEFAULT_WINDOW_HEIGHT + 25,
		webPreferences: { nodeIntegration: true }
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
	showWindowOnReady({ win: win });
	mainWindowLoadUrl({ win: win });
}
