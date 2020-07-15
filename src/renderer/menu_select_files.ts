import { ipcRenderer } from "electron";
import { EVENT_FILE_OPEN_ADD_FILES } from "../main/file_open";
import { selectFiles } from "./select_files";

export function setupSelectFilesMenu(): void {
	ipcRenderer.on(EVENT_FILE_OPEN_ADD_FILES, (_event, filePaths) => {
		selectFiles(filePaths);
	});
}
