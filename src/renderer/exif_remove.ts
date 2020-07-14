import { ExiftoolProcess } from "node-exiftool";

const EXIFTOOL_ARGS_REMOVE_EXIF = [
	"charset filename=UTF8",
	"overwrite_original",
];

// The heart of the app, removing exif data from the image.
// This uses the Perl binary "exiftool" the app's `.resources` dir
export async function removeExif(
	exifToolProcess: ExiftoolProcess,
	filePath: string
): Promise<object> {
	const exifData = exifToolProcess.writeMetadata(
		filePath,
		{ all: "" },
		EXIFTOOL_ARGS_REMOVE_EXIF,
		false
	);

	return exifData;
}
