import { getExif } from "./exif_get";
import { updateRowWithExif } from "./table_update_row";
import { ExiftoolProcess } from "node-exiftool";

export async function displayExifBeforeClean(
	exifToolProcess: ExiftoolProcess,
	trNode: HTMLTableRowElement,
	filePath: string
): Promise<any> {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)");
	if (!(tdBeforeNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	return getExif(exifToolProcess, filePath).then((exifData) => {
		updateRowWithExif(tdBeforeNode, exifData);

		return exifData;
	});
}

export async function displayExifAfterClean(
	exifToolProcess: ExiftoolProcess,
	trNode: HTMLTableRowElement,
	filePath: string
): Promise<any> {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)");
	if (!(tdAfterNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	return getExif(exifToolProcess, filePath).then((exifDataAfterClean) => {
		updateRowWithExif(tdAfterNode, exifDataAfterClean);
	});
}
