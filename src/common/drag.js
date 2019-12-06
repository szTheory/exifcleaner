'use strict'

const { addFiles } = require("common/add_files")
const { hideEmptyPane } = require("common/empty_pane")
const { showSelectedFilesPane, eraseSelectedFilesPane } = require("common/selected_files")

document.addEventListener('drop', (e) => {
	e.preventDefault()
	e.stopPropagation()

	const files = e.dataTransfer.files
	if (files.length > 0) {
		hideEmptyPane()
		eraseSelectedFilesPane()
		addFiles({ files: files })
		showSelectedFilesPane()
	}
});

document.addEventListener('dragover', (e) => {
	e.preventDefault()
	e.stopPropagation()
});
