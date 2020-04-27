import { selectFiles } from "./select_files";

document.addEventListener("drop", event => {
	event.preventDefault();
	event.stopPropagation();
	const files = event.dataTransfer.files;
	const paths = filePaths({ fileList: files });

	selectFiles({ filePaths: paths });
});

document.addEventListener("dragover", event => {
	event.preventDefault();
	event.stopPropagation();
});

function filePaths({ fileList }) {
	let paths = [];
	for (const file of fileList) {
		paths.push(file.path);
	}

	return paths;
}
