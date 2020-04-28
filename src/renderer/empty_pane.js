function hideEmptyPane() {
	const pane = emptyPane();
	if (!pane) {
		throw "Could not find empty pane to hide";
	}

	pane.classList.add("d-none");
}

function emptyPane() {
	return document.getElementById("empty");
}

module.exports = {
	hideEmptyPane
};
