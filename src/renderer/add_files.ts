import { displayExifBeforeClean, displayExifAfterClean } from "./display_exif";
import { addTableRow } from "./table_add_row";
import { updateRowWithCleanerSpinner } from "./table_update_row";

export async function addFiles(filePaths: string[]): Promise<void[]> {
	window.api.files.notifyFilesAdded(filePaths.length);
	const promises = filePaths.map((filePath) => addFile(filePath));
	return Promise.all(promises);
}

async function addFile(filePath: string): Promise<void> {
	const tableRow = addTableRow(filePath);
	await displayExifBeforeClean(tableRow, filePath);
	updateRowWithCleanerSpinner(tableRow);
	await window.api.exif.removeMetadata(filePath);
	window.api.files.notifyFileProcessed();
	await displayExifAfterClean(tableRow, filePath);
}
