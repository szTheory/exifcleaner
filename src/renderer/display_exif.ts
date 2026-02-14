import { updateRowWithExif } from "./table_update_row";

export async function displayExifBeforeClean(
	trNode: HTMLTableRowElement,
	filePath: string,
): Promise<object> {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)");
	if (!(tdBeforeNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	const exifData = await window.api.exif.readMetadata(filePath);
	updateRowWithExif(tdBeforeNode, exifData);
	return exifData;
}

export async function displayExifAfterClean(
	trNode: HTMLTableRowElement,
	filePath: string,
): Promise<void> {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)");
	if (!(tdAfterNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	const exifDataAfterClean = await window.api.exif.readMetadata(filePath);
	updateRowWithExif(tdAfterNode, exifDataAfterClean);
}
