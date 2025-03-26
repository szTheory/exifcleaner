export function selectedFilesList(): HTMLTableSectionElement | null {
	const pane = selectedFilesPane();
	if (!pane) {
		throw "Could not find file list pane element for selected files list";
	}

	return pane.querySelector("tbody");
}

export function showSelectedFilesPane(): void {
	const pane = selectedFilesPane();
	if (!pane) {
		throw "Could not find file list pane element to show";
	}

	pane.classList.remove("d-none");
}

export function eraseSelectedFilesPane(): void {
	const filesListElement = selectedFilesList();
	if (!filesListElement) {
		throw "Could not find file list element to erase";
	}

	if (filesListElement) {
		filesListElement.innerHTML = "";
	}
}

function selectedFilesPane(): HTMLElement | null {
	return document.getElementById("file-list");
}
