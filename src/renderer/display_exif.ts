import { getExif } from "./exif_get";
import { updateRowWithExif } from "./table_update_row";
import { newExifToolProcess } from "./new_process";

export async function displayExifBeforeClean({
	trNode,
	filePath,
}: {
	trNode: HTMLTableRowElement;
	filePath: string;
}): Promise<any> {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)");
	if (!(tdBeforeNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	const ep = newExifToolProcess();
	const exifData = await getExif({
		exiftoolProcess: ep,
		filePath: filePath,
	}).then((val) => {
		ep.close();
		return val;
	});

	updateRowWithExif({ tdNode: tdBeforeNode, exifData: exifData });
}

export async function displayExifAfterClean({
	trNode,
	filePath,
}: {
	trNode: HTMLTableRowElement;
	filePath: string;
}): Promise<any> {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)");
	if (!(tdAfterNode instanceof HTMLTableCellElement)) {
		throw new Error("Expected table data cell element");
	}

	const ep = newExifToolProcess();
	const newExifData = await getExif({
		exiftoolProcess: ep,
		filePath: filePath,
	}).then((val) => {
		ep.close();
		return val;
	});

	updateRowWithExif({ tdNode: tdAfterNode, exifData: newExifData });
	return Promise.resolve();
}
