export function selectedFilesList() {
	const pane = selectedFilesPane();
	if (!pane) {
		throw "Could not find file list pane element for selected files list";
	}

	return pane.querySelector("tbody");
}

export function showSelectedFilesPane() {
	const pane = selectedFilesPane();
	if (!pane) {
		throw "Could not find file list pane element to show";
	}

	pane.classList.remove("d-none");
}

export function eraseSelectedFilesPane() {
	const filesListElement = selectedFilesList();
	if (!filesListElement) {
		throw "Could not find file list element to erase";
	}

	if (filesListElement) {
		filesListElement.innerHTML = "";
	}
}

function selectedFilesPane() {
	return document.getElementById("file-list");
}
