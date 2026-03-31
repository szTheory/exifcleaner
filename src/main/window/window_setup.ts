import { BrowserWindow, app, nativeTheme } from "electron";
import path from "path";
import { isMac, isWindows } from "../../common";
import { iconPath } from "../../infrastructure";
import {
	loadWindowState,
	setupWindowStatePersistence,
} from "./window_state";

const DEFAULT_WINDOW_WIDTH = 580;
const DEFAULT_WINDOW_HEIGHT = 312;

// Match CSS --color-bg tokens from the React ThemeProvider
const LIGHT_BACKGROUND_COLOR = "#F5F6F8";
const DARK_BACKGROUND_COLOR = "#1e1e1e";

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

export function createMainWindow(): BrowserWindow {
	const savedState = loadWindowState();

	// Dynamic background color based on system theme at creation time
	// eliminates white flash in dark mode (SEC-04)
	const backgroundColor = nativeTheme.shouldUseDarkColors
		? DARK_BACKGROUND_COLOR
		: LIGHT_BACKGROUND_COLOR;

	const options: Electron.BrowserWindowConstructorOptions = {
		title: app.name,
		show: false,
		width: savedState.width,
		height: savedState.height,
		...(savedState.x !== undefined && savedState.y !== undefined
			? { x: savedState.x, y: savedState.y }
			: {}),
		minWidth: DEFAULT_WINDOW_WIDTH,
		minHeight: DEFAULT_WINDOW_HEIGHT + 25,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			devTools: !app.isPackaged,
			preload: path.join(__dirname, "../preload/index.cjs"),
		},
		backgroundColor,
		icon: iconPath(),
	};

	const win = new BrowserWindow(options);

	// Restore maximized state after creation
	if (savedState.isMaximized) {
		win.maximize();
	}

	return win;
}

export function setupMainWindow(browserWindow: BrowserWindow): void {
	setupMainWindowClose(browserWindow);
	// load URL before showing the window to avoid flash of unloaded content
	mainWindowLoadUrl(browserWindow);
	showWindowOnReady(browserWindow);
	windowsStopFlashingFrameOnFocus(browserWindow);
	setupWindowStatePersistence(browserWindow);
}
