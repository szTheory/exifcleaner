import { ExiftoolProcess } from "node-exiftool";
import { ipcRenderer } from "electron";
import { EVENT_FILE_PROCESSED, EVENT_FILES_ADDED } from "../main/dock";
import { updateRowWithCleanerSpinner } from "./table_update_row";
import { addTableRow } from "./table_add_row";
import { removeExif } from "./exif_remove";
import { displayExifBeforeClean, displayExifAfterClean } from "./display_exif";

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
