const { ipcRenderer } = require("electron");
const { DARK_MODE_MESSAGE_NAME } = require("../main/dark_mode");

export const DARK_MODE_ASK_MESSAGE_NAME = "ask-dark-mode";
const DARK_MODE_CLASS_NAME = "dark-mode";

function updateDarkMode({ isDarkMode }) {
	const bodyElem = document.querySelector("body");
	if (isDarkMode) {
		bodyElem.classList.add(DARK_MODE_CLASS_NAME);
	} else {
		bodyElem.classList.remove(DARK_MODE_CLASS_NAME);
	}
}

export const listenForDarkModeChanges = function() {
	ipcRenderer.on(DARK_MODE_MESSAGE_NAME, (_event, isDarkMode) => {
		updateDarkMode({ isDarkMode: isDarkMode });
	});

	document.addEventListener("DOMContentLoaded", _event => {
		ipcRenderer.send(DARK_MODE_ASK_MESSAGE_NAME);
	});
};
