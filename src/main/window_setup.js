const { BrowserWindow, ipcMain, app } = require("electron");
const { is } = require("electron-util");
const url = require("url");
const path = require("path");

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

function setupMainWindowClose({ win }) {
	win.on("closed", () => {
		// Dereference the window
		// For multiple windows store them in an array
		win = null;
	});
}

function showWindowOnReady({ win }) {
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

function mainWindowLoadUrl({ win }) {
	const url = urlForLoad();

	win.loadURL(url);
}

const createMainWindow = async function() {
	return new BrowserWindow({
		title: app.name,
		show: false,
		width: DEFAULT_WINDOW_WIDTH,
		height: DEFAULT_WINDOW_HEIGHT,
		webPreferences: { nodeIntegration: true }
	});
};

const setupMainWindow = function({ win }) {
	setupMainWindowClose({ win: win });
	showWindowOnReady({ win: win });
	mainWindowLoadUrl({ win: win });
};

module.exports = {
	createMainWindow,
	setupMainWindow
};
