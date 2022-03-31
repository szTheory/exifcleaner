import { ipcRenderer } from "electron";
import { ExiftoolProcess } from "node-exiftool";
import { EVENT_FILE_PROCESSED, EVENT_FILES_ADDED } from "../main/dock.js";
import {
	displayExifBeforeClean,
	displayExifAfterClean,
} from "../renderer_isolated_world/display_exif.js";
import { removeExif } from "./exif_remove.js";
import { addTableRow } from "../renderer_isolated_world/table_add_row.js";
import { updateRowWithCleanerSpinner } from "../renderer_isolated_world/table_update_row.js";

export async function addFiles(
	filePaths: string[],
	exifToolProcesses: ExiftoolProcess[]
): Promise<any[]> {
	ipcRenderer.send(EVENT_FILES_ADDED, filePaths.length);

	const filePathsIterator = filePath(filePaths);

	const promises = exifToolProcesses.map((exifToolProcess) => {
		return processFile(
			filePathsIterator,
			exifToolProcess,
			exifToolProcess.open()
		).catch(() => {
			exifToolProcess.close();
		});
	});

	return Promise.all(promises);
}

async function processFile(
	filePathsIterator: Generator<string, void, unknown>,
	exifToolProcess: ExiftoolProcess,
	exifToolPromise: Promise<any>
): Promise<any> {
	return exifToolPromise.then(() => {
		const iteratorResult = filePathsIterator.next();
		if (iteratorResult.done) {
			return exifToolProcess.close();
		}

		const filePath = iteratorResult.value;
		const promise = addFile(filePath, exifToolProcess);

		return processFile(filePathsIterator, exifToolProcess, promise);
	});
}

function* filePath(filePaths: string[]): Generator<string, any, unknown> {
	for (const filePath of filePaths) {
		yield filePath;
	}
}

async function addFile(
	filePath: string,
	exifToolProcess: ExiftoolProcess
): Promise<void> {
	const tableRow = addTableRow(filePath);

	return displayExifBeforeClean(exifToolProcess, tableRow, filePath)
		.then((_exifData) => {
			updateRowWithCleanerSpinner(tableRow);

			return removeExif(exifToolProcess, filePath);
		})
		.then((_stdOutErrOutput) => {
			ipcRenderer.send(EVENT_FILE_PROCESSED);

			return displayExifAfterClean(exifToolProcess, tableRow, filePath);
		});
}
