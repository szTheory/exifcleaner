import { ipcRenderer } from "electron";
import { spawnExifToolProcesses } from "../common/exif_tool_processes.js";
import { EVENT_ALL_FILES_PROCESSED } from "../main/dock.js";
import { addFiles } from "./add_files.js";

export async function processFiles(filePaths: string[]): Promise<void> {
	const exifToolProcesses = spawnExifToolProcesses(filePaths.length);

	addFiles(filePaths, exifToolProcesses).finally(() => {
		ipcRenderer.send(EVENT_ALL_FILES_PROCESSED);
	});
}
