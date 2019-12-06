'use strict';

// electron-webpack HMR
const { is } = require('electron-util')
if (is.development && module.hot) {
	module.hot.accept();
}

const path = require('path')
const { app, BrowserWindow, Menu } = require('electron');
/// const {autoUpdater} = require('electron-updater')
const unhandled = require('electron-unhandled')
const debug = require('electron-debug')
const contextMenu = require('electron-context-menu')
const config = require('../common/config')
const menu = require('./menu')
const packageJson = require('../../package.json')
const url = require("url")

unhandled()
debug()
contextMenu()

app.setAppUserModelId(packageJson.build.appId)

// Uncomment this before publishing your first version.
// It's commented out as it throws an error if there are no published versions.
// if (!is.development) {
// 	const FOUR_HOURS = 1000 * 60 * 60 * 4
// 	setInterval(() => {
// 		autoUpdater.checkForUpdates()
// 	}, FOUR_HOURS)
//
// 	autoUpdater.checkForUpdates()
// }

// Prevent window from being garbage collected
let mainWindow

const createMainWindow = async () => {
	const win = new BrowserWindow({
		title: app.name,
		show: false,
		width: 580,
		height: 312,
		webPreferences: { nodeIntegration: true }
	})

	win.on('ready-to-show', () => {
		win.show()
	});

	win.on('closed', () => {
		// Dereference the window
		// For multiple windows store them in an array
		mainWindow = undefined
	});

	if (is.development) {
		win.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`)
	} else {
		win.loadURL(url.format({
			pathname: path.join(__dirname, 'index.html'),
			protocol: 'file',
			slashes: true
		}))
	}

	return win
}

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit()
}

app.on('second-instance', () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore()
		}

		mainWindow.show()
	}
});

app.on('window-all-closed', () => {
	if (!is.macos) {
		app.quit()
	}
});

app.on('activate', () => {
	if (!mainWindow) {
		mainWindow = createMainWindow()
	}
});

(async () => {
	await app.whenReady()
	Menu.setApplicationMenu(menu)
	mainWindow = await createMainWindow()
})()
