import { ipcRenderer } from "electron";
import { EVENT_FILE_OPEN_ADD_FILES } from "../main/file_open.js";
import { selectFiles } from "./select_files.js";

export function setupSelectFilesMenu(): void {
	ipcRenderer.on(EVENT_FILE_OPEN_ADD_FILES, (_event, filePaths) => {
		selectFiles(filePaths);
	});
}
