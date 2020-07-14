import { ipcRenderer } from "electron";
import { spawnExifToolProcesses } from "../common/exif_tool_processes";
import { EVENT_FILE_PROCESSED } from "../main/dock";
import { addFiles } from "./add_files";
import { hideEmptyPane } from "./empty_pane";
import {
	showSelectedFilesPane,
	eraseSelectedFilesPane,
} from "./selected_files";

export function selectFiles(filePaths: string[]): void {
	if (filePaths.length == 0) {
		return;
	}

	// show selected files display panel
	hideEmptyPane();
	eraseSelectedFilesPane();
	showSelectedFilesPane();

	processFiles(filePaths);
}

async function processFiles(filePaths: string[]): Promise<void> {
	const exifToolProcesses = spawnExifToolProcesses(filePaths.length);

	addFiles(filePaths, exifToolProcesses).finally(() => {
		ipcRenderer.send(EVENT_FILE_PROCESSED);
	});
}
