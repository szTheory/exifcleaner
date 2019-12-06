'use strict'

function selectedFilesList() {
	return document.querySelector("#file-list tbody")
}

function showSelectedFilesPane() {
	selectedFilesPane().classList.remove("d-none")
}

function eraseSelectedFilesPane() {
	selectedFilesList().innerHTML = ""
}

function selectedFilesPane() {
	return document.querySelector("#file-list")
}

module.exports = {
	selectedFilesList,
	showSelectedFilesPane,
	eraseSelectedFilesPane
}
