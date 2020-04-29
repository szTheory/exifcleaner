export function hideEmptyPane() {
	const pane = emptyPane();
	if (!pane) {
		throw "Could not find empty pane to hide";
	}

	pane.classList.add("d-none");
}

function emptyPane(): HTMLElement | null {
	return document.getElementById("empty");
}
