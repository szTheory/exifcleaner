import { selectFiles } from "./select_files";

export function setupDragAndDrop(): void {
	document.addEventListener("drop", (event) => {
		handleDropEvent(event);
	});

	document.addEventListener("dragover", (event) => {
		handleDragOverEvent(event);
	});
}

function handleDropEvent(event: DragEvent): void {
	event.preventDefault();
	event.stopPropagation();

	const dataTransfer = event.dataTransfer;
	if (!dataTransfer) {
		throw new Error("Error getting data transfer for drop event");
	}
	const fileList = dataTransfer.files;
	const paths = filePaths(fileList);

	selectFiles(paths);
}

function handleDragOverEvent(event: DragEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function filePaths(fileList: FileList): string[] {
	let paths = [];
	for (const file of fileList) {
		const path = window.api.files.getPathForFile(file);
		paths.push(path);
	}

	return paths;
}
