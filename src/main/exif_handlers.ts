import { ipcMain } from "electron";
import { ExiftoolProcess } from "../infrastructure/exiftool/ExiftoolProcess";
import { exiftoolBinPath } from "../common/binaries";

const EXIFTOOL_ARGS_GET = [
	"charset filename=UTF8",
	"-File:all",
	"-ExifToolVersion",
];
const EXIFTOOL_ARGS_REMOVE = ["charset filename=UTF8", "overwrite_original"];

let exifProcess: ExiftoolProcess | null = null;
let openPromise: Promise<number> | null = null;

async function getProcess(): Promise<ExiftoolProcess> {
	if (!exifProcess) {
		exifProcess = new ExiftoolProcess(exiftoolBinPath);
		openPromise = exifProcess.open();
	}
	await openPromise;
	return exifProcess;
}

export function setupExifHandlers(): void {
	ipcMain.handle(
		"exif:read",
		async (_event, filePath: string) => {
			const proc = await getProcess();
			const result = await proc.readMetadata(filePath, EXIFTOOL_ARGS_GET);
			if (result.data === null) return {};
			return cleanExifData(result.data[0]);
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

export async function closeExifProcess(): Promise<void> {
	if (exifProcess) {
		await exifProcess.close();
		exifProcess = null;
		openPromise = null;
	}
}

function cleanExifData(
	exifHash: Record<string, unknown>,
): Record<string, unknown> {
	if (exifHash.SourceFile) delete exifHash.SourceFile;
	if (exifHash.ImageSize) delete exifHash.ImageSize;
	if (exifHash.Megapixels) delete exifHash.Megapixels;
	return exifHash;
}
