const {
	addTableRow,
	updateRowWithExif,
	updateRowWithCleanerSpinner
} = require("./table");
const exiftool = require("node-exiftool");
const { exiftoolBinPath } = require("./binaries");

async function addFiles({ files }) {
	for (const file of files) {
		addFile({ file: file });
	}
}

async function showExifBeforeClean({ trNode, filePath }) {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)");
	const exifData = await getExif({ filePath: filePath });

	updateRowWithExif({ tdNode: tdBeforeNode, exifData: exifData });
}

async function showExifAfterClean({ trNode, filePath }) {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)");
	const newExifData = await getExif({ filePath: filePath });

	updateRowWithExif({ tdNode: tdAfterNode, exifData: newExifData });
	return Promise.resolve();
}

async function addFile({ file }) {
	const filePath = file.path;

	// add row
	const trNode = addTableRow({ filePath: filePath });

	showExifBeforeClean({ trNode: trNode, filePath: filePath })
		.then(() => {
			return updateRowWithCleanerSpinner({ trNode: trNode });
		})
		.then(() => {
			return removeExif({ filePath: filePath });
		})
		.then(() => {
			return showExifAfterClean({ trNode: trNode, filePath: filePath });
		})
		.catch(console.error);
}

function cleanExifData(exifHash) {
	// remove basic file info that is part of
	// exiftools output, but not metadata
	delete exifHash.SourceFile;
	delete exifHash.ImageSize;
	delete exifHash.Megapixels;

	return exifHash;
}

// The heart of the app, removing exif data from the image.
// This uses the Perl binary "exiftool" from .resources
// TODO: ensure process is close after we're done working
// with it. I ran into some issues with auto-cleanup when
// I first built the app (when parallelizing for multiple image
// drag and drop, I think), so just got it working to start.
// But it should be easy enough to fix. Here's the relevant
// section from node-exiftool docs, from
// https://www.npmjs.com/package/node-exiftool
//
// Opening and Closing
//
// After creating an instance of ExiftoolProcess, it must be opened. When finished working with it, it should be closed, when -stay_open False will be written to its stdin to exit the process.
//
// const exiftool = require('node-exiftool')
// const ep = new exiftool.ExiftoolProcess()
//
// ep
//   .open()
//   // read and write metadata operations
//   .then(() => ep.close())
//   .then(() => console.log('Closed exiftool'))
//   .catch(console.error)
async function removeExif({ filePath }) {
	const ep = new exiftool.ExiftoolProcess(exiftoolBinPath);
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			return ep.writeMetadata(filePath, { all: "" }, ["overwrite_original"]);
		})
		.catch(console.error);

	return Promise.resolve(exifData);
}

// Read the exif data using the exiftool bin.
// This should also have the perl processes cleaned up after.
async function getExif({ filePath }) {
	const ep = new exiftool.ExiftoolProcess(exiftoolBinPath);
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			return ep
				.readMetadata(filePath, [
					"-File:all",
					"-ExifToolVersion",
					"-x FileSize",
					"-x SourceFile"
				])
				.then(
					exifData => {
						const hash = exifData.data[0];
						return cleanExifData(hash);
					},
					err => {
						console.error(err);
					}
				);
		})
		.catch(console.error);

	return Promise.resolve(exifData);
}

module.exports = {
	addFiles
};
