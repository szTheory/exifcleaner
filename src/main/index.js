// electron-webpack HMR for development
const { is } = require("electron-util");
if (is.development && module.hot) {
	module.hot.accept();
}

const path = require("path");
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const unhandled = require("electron-unhandled");
const debug = require("electron-debug");
const contextMenu = require("electron-context-menu");
const menu = require("./menu");
const packageJson = require("../../package.json");
const url = require("url");
import { setupAppCallbacks } from "./app_callbacks";
import { setupAutoUpdate } from "./auto_update";
import { listenForDarkMode, autoSetDarkMode } from "./dark_mode";
import { DARK_MODE_ASK_MESSAGE_NAME } from "../renderer/dark_mode";

// ERROR HANDLING
unhandled();

// DEV TOOLS
debug();

// CONTEXT MENU (copy/paste/etc)
contextMenu();

// USER MODEL ID
app.setAppUserModelId(packageJson.build.appId);

// AUTO UPDATE
setupAutoUpdate();

// Prevent window from being garbage collected
let mainWindow;

const createMainWindow = async () => {
	const win = new BrowserWindow({
		title: app.name,
		show: false,
		width: 580,
		height: 312,
		webPreferences: { nodeIntegration: true }
	});

	win.on("ready-to-show", () => {
		autoSetDarkMode({ win: win });
		win.show();
	});

	win.on("closed", () => {
		// Dereference the window
		// For multiple windows store them in an array
		mainWindow = undefined;
	});

	if (is.development) {
		win.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
	} else {
		win.loadURL(
			url.format({
				pathname: path.join(__dirname, "index.html"),
				protocol: "file",
				slashes: true
			})
		);
	}

	ipcMain.on(DARK_MODE_ASK_MESSAGE_NAME, () => {
		autoSetDarkMode({ win: win });
	});

	// dark mode
	listenForDarkMode({ win: win });

	return win;
};

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

setupAppCallbacks();

const setup = async () => {
	await app.whenReady();
	Menu.setApplicationMenu(menu);
	mainWindow = await createMainWindow();
};

setup();
