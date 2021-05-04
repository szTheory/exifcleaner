import { sanitizeHTML } from "./sanitize";

export function updateRowWithExif(
	tdNode: HTMLTableDataCellElement,
	exifData: any
): void {
	// td
	tdNode.textContent = "";

	// label
	const exifCount = Object.keys(exifData).length;
	const label = exifCount;

	// text
	const textNode = document.createElement("div");
	textNode.textContent = label.toString();
	textNode.classList.add("popover", "popover-bottom");
	tdNode.appendChild(textNode);

	if (exifCount > 0) {
		// popover container
		const popoverContainerNode = document.createElement("div");
		popoverContainerNode.classList.add("popover-container");
		textNode.appendChild(popoverContainerNode);
		// card
		const cardNode = document.createElement("div");
		cardNode.classList.add("card");
		popoverContainerNode.appendChild(cardNode);
		// card body
		const cardBodyNode = document.createElement("div");
		cardBodyNode.classList.add("card-body");
		cardBodyNode.innerHTML = buildExifString({ exifData: exifData });
		cardNode.appendChild(cardBodyNode);
	}
}

function buildExifString({ exifData }: { exifData: any }): string {
	let str = "";

	for (const [key, value] of Object.entries(exifData)) {
		if (typeof value !== "string") {
			continue;
		}
		str += key + " " + "<strong>" + sanitizeHTML(value) + "</strong>" + "<br>";
	}

	return str;
}

export function updateRowWithCleanerSpinner(trNode: HTMLTableRowElement): void {
	// td
	const tdNode = trNode.querySelector("td:nth-child(3)");
	if (!tdNode) {
		throw `Could not find table data cell element for row ${trNode}`;
	}

	// spinner
	const spinnerNode = document.createElement("div");
	spinnerNode.classList.add("loading");
	tdNode.appendChild(spinnerNode);
}
