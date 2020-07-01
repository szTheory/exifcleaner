import { ipcRenderer } from "electron";
import { selectFiles } from "./select_files";
import { EVENT_FILE_OPEN_ADD_FILES } from "../main/menu_file_open";

export function setupSelectFilesMenu() {
	ipcRenderer.on(EVENT_FILE_OPEN_ADD_FILES, (event, filePaths) => {
		selectFiles({ filePaths: filePaths });
	});
}
