const { addFiles } = require("./add_files");
const { hideEmptyPane } = require("./empty_pane");
const {
	showSelectedFilesPane,
	eraseSelectedFilesPane
} = require("./selected_files");

export function selectFiles({ filePaths }: { filePaths: string[] }) {
	if (filePaths.length > 0) {
		hideEmptyPane();
		eraseSelectedFilesPane();
		addFiles({ filePaths: filePaths });
		showSelectedFilesPane();
	}
}
