'use strict'

const { addTableRow, updateRowWithExif, updateRowWithCleanerSpinner } = require("./table")
const exiftool = require('node-exiftool')
const { exiftoolBinPath } = require('./binaries')

async function addFiles({ files }) {
	for (const file of files) {
		addFile({ file: file })
	}
}

async function showExifBeforeClean({ trNode, filePath }) {
	const tdBeforeNode = trNode.querySelector("td:nth-child(2)")
	const exifData = await getExif({ filePath: filePath })

	updateRowWithExif({ tdNode: tdBeforeNode, exifData: exifData })
}

async function showExifAfterClean({ trNode, filePath }) {
	const tdAfterNode = trNode.querySelector("td:nth-child(3)")
	const newExifData = await getExif({ filePath: filePath })

	updateRowWithExif({ tdNode: tdAfterNode, exifData: newExifData })
	return Promise.resolve()
}

async function addFile({ file }) {
	const filePath = file.path

	// add row
	const trNode = addTableRow({ filePath: filePath })

	showExifBeforeClean({ trNode: trNode, filePath: filePath })
		.then(() => { return updateRowWithCleanerSpinner({ trNode: trNode }) })
		.then(() => { return removeExif({ filePath: filePath }) })
		.then(() => { return showExifAfterClean({ trNode: trNode, filePath: filePath }) })
		.catch(console.error)
}

async function removeExif({ filePath }) {
	const ep = new exiftool.ExiftoolProcess(exiftoolBinPath)
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			return ep.writeMetadata(filePath, { all: '' }, ['overwrite_original'])
		}).catch(console.error)

	return Promise.resolve(exifData)
}

function cleanExifData(exifHash) {
	// remove basic file info that is part of
	// exiftools output, but not metadata
	delete exifHash["SourceFile"]
	delete exifHash["ImageSize"]
	delete exifHash["Megapixels"]

	return exifHash
}

async function getExif({ filePath }) {
	const ep = new exiftool.ExiftoolProcess(exiftoolBinPath)
	const exifData = ep
		.open()
		// .then((pid) => console.log('Started exiftool process %s', pid))
		.then(() => {
			return ep.readMetadata(filePath, ['-File:all', '-ExifToolVersion', '-x FileSize', '-x SourceFile']).then((exifData) => {
				const hash = exifData.data[0]
				return cleanExifData(hash)
			}, (err) => {
				console.error
			})
		})
		.catch(console.error)

	return Promise.resolve(exifData)
}

module.exports = {
	addFiles,
}
