import { ExiftoolProcess } from "node-exiftool";

const EXIFTOOL_ARGS_GET_EXIF = [
	"charset filename=UTF8",
	"-File:all",
	"-ExifToolVersion",
];

// Read exif data using the ExifTool binary
// and clean up after the process when done
export async function getExif(
	exiftoolProcess: ExiftoolProcess,
	filePath: string
): Promise<object> {
	const exifData = exiftoolProcess
		.readMetadata(filePath, EXIFTOOL_ARGS_GET_EXIF)
		.then((exifData) => {
			if (exifData.data === null) {
				return {};
			}

			const hash = exifData.data[0];
			return cleanExifDataOutput(hash);
		});

	return exifData;
}

function cleanExifDataOutput(exifHash: any): any {
	// remove basic file info that is part of
	// exiftools output, but not metadata
	if (exifHash.SourceFile) {
		delete exifHash.SourceFile;
	}
	if (exifHash.ImageSize) {
		delete exifHash.ImageSize;
	}
	if (exifHash.Megapixels) {
		delete exifHash.Megapixels;
	}

	return exifHash;
}
