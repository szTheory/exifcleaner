import { updateRowWithCleanerSpinner } from "./table_update_row";
import { addTableRow } from "./table_add_row";
import { ipcRenderer } from "electron";
import { EVENT_FILE_PROCESSED, EVENT_FILES_ADDED } from "../main/dock";
import { removeExif } from "./exif_remove";
import { displayExifBeforeClean, displayExifAfterClean } from "./display_exif";
import { newExifToolProcess } from "./new_process";

export async function addFiles({ filePaths }: { filePaths: string[] }) {
	ipcRenderer.send(EVENT_FILES_ADDED, filePaths.length.toString());

	for (const filePath of filePaths) {
		addFile({ filePath: filePath });
	}
}

async function addFile({ filePath }: { filePath: string }): Promise<any> {
	// add table row
	const trNode = addTableRow({ filePath: filePath });

	displayExifBeforeClean({ trNode: trNode, filePath: filePath })
		.then(() => {
			return updateRowWithCleanerSpinner({ trNode: trNode });
		})
		.then(() => {
			const ep = newExifToolProcess();
			return removeExif({ ep: ep, filePath: filePath }).then((val) => {
				ep.close();
				return val;
			});
		})
		.then(() => {
			return displayExifAfterClean({ trNode: trNode, filePath: filePath });
		})
		.then(() => {
			return new Promise(function (resolve) {
				ipcRenderer.send(EVENT_FILE_PROCESSED);
				resolve();
			});
		})
		.catch(console.error);
}
