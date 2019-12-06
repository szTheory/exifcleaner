'use strict'

const { addTableRow, updateRowWithExif, updateRowWithCleanerSpinner } = require("common/table")
const exiftool = require('node-exiftool')
const exiftoolBin = require('dist-exiftool')
const ep = new exiftool.ExiftoolProcess(exiftoolBin)

async function addFiles({ files }) {
	await ep
		.open()
		.then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			for (const file of files) {
				addFile({ file: file })
			}
		}, (err) => {
			console.error
		})

	ep.close()
}

async function showExifBeforeClean({ trNode, filePath }) {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)")
	const exifData = await getExif({ filePath: filePath })

	updateRowWithExif({ tdNode: tdBeforeNode, exifData: exifData })

	return new Promise(function (resolve, reject) {
		console.log("**1");
		resolve()
	})
}

async function showExifAfterClean({ trNode, filePath }) {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)")
	const newExifData = await getExif({ filePath: filePath })
	console.log(newExifData);
	// updateRowWithExif({ tdNode: tdAfterNode, exifData: newExifData })

	return new Promise(function (resolve, reject) {
		console.log("**4");
		resolve()
	})
}

async function addFile({ file }) {
	const filePath = file.path

	// add row
	const trNode = addTableRow({ filePath: filePath })

	showExifBeforeClean({ trNode: trNode, filePath: filePath })
		.then(() => updateRowWithCleanerSpinner({ trNode: trNode }))
		.then(() => removeExif({ filePath: filePath }))
		.then(() => showExifAfterClean({ trNode: trNode, filePath: filePath }))
}

async function removeExif({ filePath }) {
	return ep
		.writeMetadata(filePath, { all: '' }, ['overwrite_original'])
		.then(console.log, console.error)
		.then(console.log("**3"))
		.catch(console.error)
}

function cleanExifData(exifHash) {
	// sourcefile is part of exiftools output, it's not metadata
	delete exifHash["SourceFile"]
	return exifHash
}

async function getExif({ filePath }) {
	console.log("++++");
	return ep.readMetadata(filePath, ['-File:all', '-ExifToolVersion', '-x FileSize', '-x SourceFile']).then((exifData) => {
		console.log("----");
		console.log(exifData.data);
		console.log("----");
		const hash = exifData.data[0]
		return cleanExifData(hash)
	}, (err) => {
		console.error
	})
}

module.exports = {
	addFiles,
}
