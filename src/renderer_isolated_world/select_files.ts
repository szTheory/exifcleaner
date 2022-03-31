import { hideEmptyPane } from "./empty_pane.js";
import {
	showSelectedFilesPane,
	eraseSelectedFilesPane,
} from "./selected_files";

export function selectFiles(filePaths: string[]): void {
	if (filePaths.length == 0) {
		return;
	}

	// show selected files display panel
	hideEmptyPane();
	eraseSelectedFilesPane();
	showSelectedFilesPane();

	// processFiles(filePaths);
	window.electron.processFiles(filePaths);
}
