const { addFiles } = require('./add_files')
const { hideEmptyPane } = require('./empty_pane')
const { showSelectedFilesPane, eraseSelectedFilesPane } = require('./selected_files')

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
})

document.addEventListener('dragover', (e) => {
  e.preventDefault()
  e.stopPropagation()
})
