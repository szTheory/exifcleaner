import { selectFiles } from "./select_files";

function respondToDropEvent(event: DragEvent): void {
	event.preventDefault();
	event.stopPropagation();
	const dataTransfer = event.dataTransfer;
	if (!dataTransfer) {
		throw "Error getting data transfer for drop event";
	}
	const files = dataTransfer.files;
	const paths = filePaths({ fileList: files });

	selectFiles({ filePaths: paths });
}

function respondToDragOverEvent(event: DragEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function filePaths({ fileList }: { fileList: FileList }): string[] {
	let paths = [];
	for (const file of fileList) {
		paths.push(file.path);
	}

	return paths;
}

export function setupDragAndDrop() {
	document.addEventListener("drop", event => {
		respondToDropEvent(event);
	});

	document.addEventListener("dragover", event => {
		respondToDragOverEvent(event);
	});
}
