import { selectFiles } from "./select_files";

export function setupSelectFilesMenu(): void {
	window.api.files.onFileOpenAddFiles((filePaths) => {
		selectFiles(filePaths);
	});
}
