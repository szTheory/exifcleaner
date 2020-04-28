const { ipcRenderer } = require("electron");
const { selectFiles } = require("./select_files");
const { EVENT_FILE_OPEN_ADD_FILES } = require("../main/menu_file_open");

ipcRenderer.on(EVENT_FILE_OPEN_ADD_FILES, (event, filePaths) => {
	selectFiles({ filePaths: filePaths });
});
