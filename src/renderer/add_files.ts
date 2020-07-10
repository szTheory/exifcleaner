import {
	addTableRow,
	updateRowWithExif,
	updateRowWithCleanerSpinner
} from "./table";
import exiftool, { ExiftoolProcess } from "node-exiftool";
import { exiftoolBinPath } from "../common/binaries";
import { withArgsTempFile } from "../common/args_file";

export async function addFiles({ filePaths }: { filePaths: string[] }) {
	for (const filePath of filePaths) {
		addFile({ filePath: filePath });
	}
}

function newExifToolProcess(): exiftool.ExiftoolProcess {
	const binPath = exiftoolBinPath();

	return new exiftool.ExiftoolProcess(binPath);
}

async function showExifBeforeClean({
	trNode,
	filePath
}: {
	trNode: HTMLTableRowElement;
	filePath: string;
}): Promise<any> {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)");
	if (!(tdBeforeNode instanceof HTMLTableCellElement)) {
		console.log(tdBeforeNode);
		throw new Error("Expected table data cell element");
	}

	const ep = newExifToolProcess();
	const exifData = await getExif({
		exiftoolProcess: ep,
		filePath: filePath
	}).then(val => {
		ep.close();
		return val;
	});

	updateRowWithExif({ tdNode: tdBeforeNode, exifData: exifData });
}

async function showExifAfterClean({
	trNode,
	filePath
}: {
	trNode: HTMLTableRowElement;
	filePath: string;
}): Promise<any> {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)");
	if (!(tdAfterNode instanceof HTMLTableCellElement)) {
		console.log(tdAfterNode);
		throw new Error("Expected table data cell element");
	}

	const ep = newExifToolProcess();
	const newExifData = await getExif({
		exiftoolProcess: ep,
		filePath: filePath
	}).then(val => {
		ep.close();
		return val;
	});

	updateRowWithExif({ tdNode: tdAfterNode, exifData: newExifData });
	return Promise.resolve();
}

async function addFile({ filePath }: { filePath: string }): Promise<any> {
	// add row
	const trNode = addTableRow({ filePath: filePath });

	showExifBeforeClean({ trNode: trNode, filePath: filePath })
		.then(() => {
			return updateRowWithCleanerSpinner({ trNode: trNode });
		})
		.then(() => {
			const ep = newExifToolProcess();
			return removeExif({ ep: ep, filePath: filePath }).then(val => {
				ep.close();
				return val;
			});
		})
		.then(() => {
			return showExifAfterClean({ trNode: trNode, filePath: filePath });
		})
		.catch(console.error);
}

function cleanExifData(exifHash: any): any {
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
async function removeExif({
	ep,
	filePath
}: {
	ep: any;
	filePath: string;
}): Promise<object> {
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			const args = ["-charset filename=UTF8", "overwrite_original"];

			return withArgsTempFile(args, argsTempFilePath => {
				return ep.writeMetadata(filePath, { all: "" }, [
					`-@ ${argsTempFilePath}`
				]);
			});
		})
		.catch(console.error);

	return exifData;
}

// Read the exif data using the exiftool bin.
// This should also have the perl processes cleaned up after.
async function getExif({
	exiftoolProcess,
	filePath
}: {
	exiftoolProcess: ExiftoolProcess;
	filePath: string;
}): Promise<object> {
	const exifData = exiftoolProcess
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			const args = [
				"-charset filename=UTF8",
				"-File:all",
				"-ExifToolVersion",
				"-x FileSize",
				"-x SourceFile"
			];

			return withArgsTempFile(args, argsTempFilePath => {
				return exiftoolProcess
					.readMetadata(filePath, [`-@ ${argsTempFilePath}`])
					.then(
						exifData => {
							if (exifData.data === null) {
								return {};
							}

							const hash = exifData.data[0];
							return cleanExifData(hash);
						},
						err => {
							console.error(err);
						}
					);
			});
		})
		.catch(console.error);

	return exifData;
}
