import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { afterEach, expect, test } from "vitest";
import * as fileRowStories from "../src/renderer/components/file-list/FileRow.stories";
import * as metadataFieldStories from "../src/renderer/components/file-list/MetadataField.stories";
import preview from "./preview";
import pendingData from "./phase78_surface_pending.json";

setProjectAnnotations([a11yAnnotations, preview]);

const { Cleaned, AlreadyClean, Unchanged } = composeStories(fileRowStories);
const { Removed, Preserved } = composeStories(metadataFieldStories);

type Theme = "light" | "dark";
type RenderableStory = {
	run: (context: {
		canvasElement: HTMLElement;
		globals: Record<string, unknown>;
	}) => Promise<unknown>;
	globals?: Record<string, unknown>;
};
type Observation = {
	case: string;
	story: string;
	selector: string;
	theme: Theme;
	actual: string;
	expected: string;
};
type PendingObservation = Observation & { reason: string };

const pending = pendingData.pending as PendingObservation[];
const mounted: HTMLElement[] = [];
const STATUS_SELECTOR =
	".file-table__after-done > .status-icon > .status-icon__check";

afterEach(() => {
	for (const host of mounted.splice(0)) host.remove();
});

async function renderStory(
	story: RenderableStory,
	theme: Theme,
): Promise<HTMLElement> {
	const host = document.createElement("div");
	host.style.position = "relative";
	host.style.padding = "24px";
	document.body.append(host);
	mounted.push(host);
	await story.run({
		canvasElement: host,
		globals: { ...story.globals, theme, locale: "en" },
	});
	return host;
}

function resolveColor(host: HTMLElement, token: string): string {
	const probe = document.createElement("span");
	probe.style.color = `var(${token})`;
	probe.setAttribute("aria-hidden", "true");
	host.append(probe);
	try {
		return getComputedStyle(probe).color;
	} finally {
		probe.remove();
	}
}

function exactPendingMatch(
	observation: Observation,
): PendingObservation | undefined {
	return pending.find(
		(row) =>
			row.case === observation.case &&
			row.story === observation.story &&
			row.selector === observation.selector &&
			row.theme === observation.theme &&
			row.actual === observation.actual &&
			row.expected === observation.expected,
	);
}

function outcome(observation: Observation): "pass" | "pending" | "fail" {
	if (observation.actual === observation.expected) return "pass";
	return exactPendingMatch(observation) === undefined ? "fail" : "pending";
}

function requireStatusCheck(host: HTMLElement): SVGElement {
	const check = host.querySelector<SVGElement>(STATUS_SELECTOR);
	if (check === null)
		throw new Error(`missing rendered check: ${STATUS_SELECTOR}`);
	return check;
}

test("rendered checks use teal only for cleaned outcomes; planted teal stays red", async () => {
	const consumedPending = new Set<PendingObservation>();
	const cases = [
		{
			story: "file-list-filerow--cleaned",
			name: "cleaned",
			component: Cleaned,
			token: "--ec-color-cleaned",
		},
		{
			story: "file-list-filerow--already-clean",
			name: "already-clean",
			component: AlreadyClean,
			token: "--ec-color-text-secondary",
		},
		{
			story: "file-list-filerow--unchanged",
			name: "unchanged",
			component: Unchanged,
			token: "--ec-color-text-secondary",
		},
	] as const;

	for (const theme of ["light", "dark"] as const) {
		for (const current of cases) {
			const host = await renderStory(current.component, theme);
			const check = requireStatusCheck(host);
			const expected = resolveColor(host, current.token);
			const actual = getComputedStyle(check).color;
			const observation: Observation = {
				case: "outcome-color",
				story: current.story,
				selector: STATUS_SELECTOR,
				theme,
				actual,
				expected,
			};
			const result = outcome(observation);
			expect(
				result,
				`${current.name} check in ${theme}: ${actual} should match ${expected}`,
			).not.toBe("fail");
			const matched = exactPendingMatch(observation);
			if (matched !== undefined) consumedPending.add(matched);
			await expect(check.querySelector("path")?.getAttribute("d")).toBe(
				"M3.5 8.5L6.5 11.5L12.5 4.5",
			);
		}

		const host = await renderStory(AlreadyClean, theme);
		const realCheck = requireStatusCheck(host);
		const planted = realCheck.cloneNode(true) as SVGElement;
		planted.dataset.phase78Negative = "already-clean-teal";
		planted.style.color = "var(--ec-color-cleaned)";
		host.append(planted);
		const plantedObservation: Observation = {
			case: "planted-already-clean-teal",
			story: "file-list-filerow--already-clean",
			selector: '[data-phase78-negative="already-clean-teal"]',
			theme,
			actual: getComputedStyle(planted).color,
			expected: resolveColor(host, "--ec-color-text-secondary"),
		};
		expect(plantedObservation.actual).toBe(
			resolveColor(host, "--ec-color-cleaned"),
		);
		expect(exactPendingMatch(plantedObservation)).toBeUndefined();
		expect(outcome(plantedObservation)).toBe("fail");
	}

	expect([...consumedPending]).toHaveLength(pending.length);
});

test("removed and preserved metadata retain signs and labels over neutral colors", async () => {
	for (const theme of ["light", "dark"] as const) {
		for (const [story, expectedLabel, expectedSign] of [
			[Removed, "Model: removed", "−"],
			[Preserved, "Orientation: preserved", "✓"],
		] as const) {
			const host = await renderStory(story, theme);
			const row = host.querySelector<HTMLElement>(".metadata-field");
			const icon = row?.querySelector<HTMLElement>(".metadata-field__icon");
			const name = row?.querySelector<HTMLElement>(".metadata-field__name");
			const value = row?.querySelector<HTMLElement>(".metadata-field__value");
			const surface = host.querySelector<HTMLElement>(".metadata-expansion");
			expect(row).not.toBeNull();
			expect(icon).not.toBeNull();
			expect(name).not.toBeNull();
			expect(value).not.toBeNull();
			expect(surface).not.toBeNull();
			expect(row?.getAttribute("aria-label")).toBe(expectedLabel);
			expect(icon?.textContent).toBe(expectedSign);
			expect(getComputedStyle(row as HTMLElement).backgroundColor).toBe(
				"rgba(0, 0, 0, 0)",
			);
			expect(getComputedStyle(surface as HTMLElement).backgroundColor).toBe(
				resolveColor(host, "--ec-color-surface"),
			);
			expect(getComputedStyle(row as HTMLElement).color).toBe(
				resolveColor(host, "--ec-color-text"),
			);
			expect(getComputedStyle(icon as HTMLElement).color).toBe(
				resolveColor(host, "--ec-color-text-secondary"),
			);
			expect(getComputedStyle(name as HTMLElement).color).toBe(
				resolveColor(host, "--ec-color-text"),
			);
			expect(getComputedStyle(value as HTMLElement).color).toBe(
				resolveColor(host, "--ec-color-text-secondary"),
			);
		}
	}
});
