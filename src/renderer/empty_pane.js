function hideEmptyPane() {
	emptyPane().classList.add("d-none");
}

function emptyPane() {
	return document.querySelector("#empty");
}

module.exports = {
	hideEmptyPane
};
