import { addFiles } from "./add_files";
import { hideEmptyPane } from "./empty_pane";
import {
	showSelectedFilesPane,
	eraseSelectedFilesPane,
} from "./selected_files";

export function selectFiles(filePaths: string[]): void {
	if (filePaths.length === 0) {
		return;
	}

	hideEmptyPane();
	eraseSelectedFilesPane();
	showSelectedFilesPane();

	processFiles(filePaths);
}

async function processFiles(filePaths: string[]): Promise<void> {
	addFiles(filePaths).finally(() => {
		window.api.files.notifyAllFilesProcessed();
	});
}
