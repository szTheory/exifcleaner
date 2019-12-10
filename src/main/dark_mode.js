import { systemPreferences, nativeTheme } from "electron";

export const DARK_MODE_MESSAGE_NAME = "dark-mode";

export const isDarkMode = function() {
	// TODO: switch to this after upgrade to Electron 7
	// return nativeTheme.shouldUseDarkColors;
	// systemPreferences for Electron 6 compat
	// source: electronjs.org/docs/tutorial/mojave-dark-mode-guide
	return systemPreferences.isDarkMode();
};

export const listenForDarkMode = function({ win }) {
	systemPreferences.subscribeNotification(
		"AppleInterfaceThemeChangedNotification",
		() => autoSetDarkMode({ win: win })
	);
};

export const autoSetDarkMode = function({ win }) {
	console.log("----- autoSetDarkMode");
	win.webContents.send(DARK_MODE_MESSAGE_NAME, isDarkMode());
};
