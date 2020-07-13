const EXIFTOOL_ARGS_REMOVE_EXIF = [
	"charset filename=UTF8",
	"overwrite_original",
];

// The heart of the app, removing exif data from the image.
// This uses the Perl binary "exiftool" the app's `.resources` dir
//
// Opening and Closing
//
// After creating an instance of ExiftoolProcess, it must be opened.
// When finished working with it, it should be closed,
// when -stay_open False will be written to its stdin to exit the process.
//
// import exiftool from "node-exiftool"
// const ep = new exiftool.ExiftoolProcess()
//
// ep
//   .open()
//   // read and write metadata operations
//   .then(() => ep.close())
//   .then(() => console.log('Closed exiftool'))
//   .catch(console.error)
export async function removeExif({
	ep,
	filePath,
}: {
	ep: any;
	filePath: string;
}): Promise<object> {
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			return ep.writeMetadata(filePath, { all: "" }, EXIFTOOL_ARGS_REMOVE_EXIF);
		});
	// .catch(console.error);

	return exifData;
}
