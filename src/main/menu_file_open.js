const { dialog } = require("electron");

const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";

function fileOpenClick(event, focusedWindow, focusedWebContents) {
	dialog
		.showOpenDialog(focusedWindow, {
			properties: ["openFile", "multiSelections"]
		})
		.then(result => {
			if (result.filePaths) {
				focusedWindow.webContents.send(
					EVENT_FILE_OPEN_ADD_FILES,
					result.filePaths
				);
			}
		});
}

function fileMenuOpenItem() {
	return {
		label: "Open…",
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick
	};
}

module.exports = {
	fileOpenClick,
	fileMenuOpenItem,
	EVENT_FILE_OPEN_ADD_FILES
};
