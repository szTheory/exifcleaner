export function hideEmptyPane(): void {
	const pane = emptyPane();
	if (!pane) {
		throw new Error("Could not find empty pane to hide");
	}

	pane.classList.add("d-none");
}

function emptyPane(): HTMLElement | null {
	return document.getElementById("empty");
}
