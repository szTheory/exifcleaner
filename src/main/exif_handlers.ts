import { ipcMain } from "electron";
import type { ExiftoolProcess } from "../infrastructure/exiftool/ExiftoolProcess";
import { cleanExifData } from "../domain/exif";

const EXIFTOOL_ARGS_GET = ["-File:all", "-ExifToolVersion"];
const EXIFTOOL_ARGS_REMOVE = ["-overwrite_original"];

export function setupExifHandlers({
	getProcess,
}: {
	getProcess: () => Promise<ExiftoolProcess>;
}): void {
	ipcMain.handle(
		"exif:read",
		async (_event, filePath: string) => {
			const proc = await getProcess();
			const result = await proc.readMetadata(filePath, EXIFTOOL_ARGS_GET);
			if (result.data === null) return {};
			const firstItem = result.data[0];
			if (firstItem === undefined) return {};
			return cleanExifData(firstItem);
		},
	);

	ipcMain.handle(
		"exif:remove",
		async (_event, filePath: string) => {
			const proc = await getProcess();
			return proc.writeMetadata(
				filePath,
				{ all: "" },
				EXIFTOOL_ARGS_REMOVE,
				false,
			);
		},
	);
}
