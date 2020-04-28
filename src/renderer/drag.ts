import { selectFiles } from "./select_files";

document.addEventListener("drop", event => {
	event.preventDefault();
	event.stopPropagation();
	const dataTransfer = event.dataTransfer;
	if (!dataTransfer) {
		throw "Error getting data transfer for drop event";
	}
	const files = dataTransfer.files;
	const paths = filePaths({ fileList: files });

	selectFiles({ filePaths: paths });
});

document.addEventListener("dragover", event => {
	event.preventDefault();
	event.stopPropagation();
});

function filePaths({ fileList }: { fileList: FileList }) {
	let paths = [];
	for (const file of fileList) {
		paths.push(file.path);
	}

	return paths;
}
