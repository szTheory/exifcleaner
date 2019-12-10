import { BrowserWindow, ipcMain, app } from "electron";
import { is } from "electron-util";
import { listenForDarkMode, autoSetDarkMode } from "./dark_mode";
import { DARK_MODE_ASK_MESSAGE_NAME } from "../renderer/dark_mode";
import { url } from "url";
import { path } from "path";

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

function setupMainWindowClose({ win }) {
	win.on("closed", () => {
		// Dereference the window
		// For multiple windows store them in an array
		win = undefined;
	});
}

function setupMainWindowDarkMode({ win }) {
	win.on("ready-to-show", () => {
		console.log("ready-to-show !!!");
		autoSetDarkMode({ win: win });
		win.show();
	});

	win.on("show", () => {
		console.log("show....");
		autoSetDarkMode({ win: win });
	});

	ipcMain.on(DARK_MODE_ASK_MESSAGE_NAME, () => {
		autoSetDarkMode({ win: win });
	});

	listenForDarkMode({ win: win });
}

function mainWindowLoadUrl({ win }) {
	const urlForLoad = is.development
		? `http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`
		: url.format({
				pathname: path.join(__dirname, "index.html"),
				protocol: "file",
				slashes: true
		  });
	win.loadURL(urlForLoad);
}

export const createMainWindow = async function() {
	return new BrowserWindow({
		title: app.name,
		show: false,
		width: DEFAULT_WINDOW_WIDTH,
		height: DEFAULT_WINDOW_HEIGHT,
		webPreferences: { nodeIntegration: true }
	});
};

export const setupMainWindow = function({ win }) {
	setupMainWindowClose({ win: win });
	setupMainWindowDarkMode({ win: win });
	mainWindowLoadUrl({ win: win });
};
