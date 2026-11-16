import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SUPPORTED_EXTENSIONS } from "../src/domain/files/file_types";
import { TypePill } from "../src/renderer/components/ui/TypePill";

function expectedLabels(supported: Iterable<string>): string[] {
	return [...supported]
		.map((extension) => extension.replace(/^\./, "").toUpperCase())
		.sort();
}

function renderPills(labels: readonly string[]): HTMLDivElement {
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(
		<div>
			{labels.map((label) => (
				<TypePill key={label} extension={label} />
			))}
		</div>,
	);
	document.body.append(container);
	return container;
}

function visibleLabels(container: ParentNode): string[] {
	return [...container.querySelectorAll<HTMLElement>(".type-pill")].map(
		(pill) => pill.innerText,
	);
}

function extensionBadgeProblems(
	supported: Iterable<string>,
	labels: readonly string[],
): string[] {
	const expected = new Set(expectedLabels(supported));
	const counts = new Map<string, number>();
	const problems: string[] = [];

	for (const [index, rawLabel] of labels.entries()) {
		const label = rawLabel.trim();
		if (label.length === 0) {
			problems.push(`badge ${index + 1} has blank visible text`);
			continue;
		}
		if (label !== label.toUpperCase()) {
			problems.push(`badge ${index + 1} is not uppercase: ${label}`);
		}
		counts.set(label, (counts.get(label) ?? 0) + 1);
		if (!expected.has(label)) problems.push(`${label} is not supported`);
	}

	for (const label of [...expected].sort()) {
		const count = counts.get(label) ?? 0;
		if (count === 0) problems.push(`${label} is missing`);
		else if (count > 1) problems.push(`${label} appears ${count} times`);
	}
	return problems.sort();
}

test("each supported extension renders once as visible uppercase badge text", () => {
	const labels = expectedLabels(SUPPORTED_EXTENSIONS);
	const container = renderPills(labels);
	try {
		const pills = [...container.querySelectorAll<HTMLElement>(".type-pill")];
		const actualLabels = pills.map((pill) => pill.innerText);

		expect(pills).toHaveLength(labels.length);
		expect(pills.every((pill) => pill.getClientRects().length > 0)).toBe(true);
		expect(actualLabels).toEqual(labels);
		expect(actualLabels.every((label) => label.trim().length > 0)).toBe(true);
		expect(extensionBadgeProblems(SUPPORTED_EXTENSIONS, actualLabels)).toEqual(
			[],
		);
	} finally {
		container.remove();
	}
});

test("reports exactly the supported extension omitted from an in-memory fixture", () => {
	const labels = expectedLabels(SUPPORTED_EXTENSIONS);
	const omitted = labels[0];
	if (omitted === undefined)
		throw new Error("supported extension set is empty");
	const container = renderPills(labels.filter((label) => label !== omitted));
	try {
		expect(
			extensionBadgeProblems(SUPPORTED_EXTENSIONS, visibleLabels(container)),
		).toEqual([`${omitted} is missing`]);
	} finally {
		container.remove();
	}
});

test("reports exact duplicate and blank badge diagnostics in an in-memory fixture", () => {
	const labels = expectedLabels(SUPPORTED_EXTENSIONS);
	const container = renderPills(labels);
	try {
		const firstLabel = labels[0];
		if (firstLabel === undefined)
			throw new Error("supported extension set is empty");
		const duplicate = document.createElement("span");
		duplicate.className = "type-pill";
		duplicate.textContent = firstLabel;
		container.append(duplicate);
		const blank = document.createElement("span");
		blank.className = "type-pill";
		container.append(blank);

		const expected = [
			`${firstLabel} appears 2 times`,
			`badge ${labels.length + 2} has blank visible text`,
		].sort();
		expect(
			extensionBadgeProblems(SUPPORTED_EXTENSIONS, visibleLabels(container)),
		).toEqual(expected);
	} finally {
		container.remove();
	}
});
