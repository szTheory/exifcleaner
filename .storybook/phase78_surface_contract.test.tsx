import {
	composeStories,
	composeStory,
	setProjectAnnotations,
} from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { afterEach, expect, test } from "vitest";
import * as fileRowStories from "../src/renderer/components/file-list/FileRow.stories";
import * as metadataFieldStories from "../src/renderer/components/file-list/MetadataField.stories";
import * as emptyStateStories from "../src/renderer/components/ui/EmptyState.stories";
import preview from "./preview";
import pendingData from "./phase78_surface_pending.json";

setProjectAnnotations([a11yAnnotations, preview]);

const { Cleaned, AlreadyClean, Unchanged, HugeSize, HugeTagCounts } =
	composeStories(fileRowStories);
const { Removed, Preserved } = composeStories(metadataFieldStories);
const LocalizedUnchanged = composeStory(
	{ ...fileRowStories.Unchanged, play: async () => {} },
	fileRowStories.default,
);
const LocalizedEmptyState = composeStory(
	{ ...emptyStateStories.CopyModeOn, play: async () => {} },
	emptyStateStories.default,
);

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
	locale?: string;
	actual: string;
	expected: string;
};
type PendingObservation = Observation & { reason: string };

const pending = pendingData.pending as PendingObservation[];
const mounted: HTMLElement[] = [];
const STATUS_SELECTOR =
	".file-table__after-done > .status-icon > .status-icon__check";
const LOCALE_SCENES = [
	{ locale: "de", dir: "ltr" },
	{ locale: "hu", dir: "ltr" },
	{ locale: "ar", dir: "rtl" },
] as const;
const OVERFLOW_EXPECTED = "scrollWidth <= clientWidth";

afterEach(() => {
	for (const host of mounted.splice(0)) host.remove();
});

test("pending exceptions are exact story and selector observations", () => {
	expect(pendingData.schemaVersion).toBe(1);
	for (const row of pending) {
		expect(Object.keys(row).sort()).toEqual(
			row.locale === undefined
				? ["actual", "case", "expected", "reason", "selector", "story", "theme"]
				: [
						"actual",
						"case",
						"expected",
						"locale",
						"reason",
						"selector",
						"story",
						"theme",
					],
		);
		for (const value of [
			row.case,
			row.story,
			row.selector,
			row.actual,
			row.expected,
			row.reason,
		]) {
			expect(value).not.toContain("*");
			expect(value.trim()).not.toBe("");
		}
		expect(["light", "dark"]).toContain(row.theme);
		if (row.case !== "outcome-color")
			expect(["de", "hu", "ar"]).toContain(row.locale);
	}
});

async function renderStory(
	story: RenderableStory,
	theme: Theme,
	locale = "en",
): Promise<HTMLElement> {
	const host = document.createElement("div");
	host.style.position = "relative";
	host.style.padding = "24px";
	document.body.append(host);
	mounted.push(host);
	await story.run({
		canvasElement: host,
		globals: { ...story.globals, theme, locale },
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
			row.locale === observation.locale &&
			row.actual === observation.actual &&
			row.expected === observation.expected,
	);
}

function outcome(observation: Observation): "pass" | "pending" | "fail" {
	if (observation.actual === observation.expected) return "pass";
	return exactPendingMatch(observation) === undefined ? "fail" : "pending";
}

function clipOutcome(observation: Observation): "pass" | "pending" | "fail" {
	if (observation.actual === observation.expected) return "pass";
	return exactPendingMatch(observation) === undefined ? "fail" : "pending";
}

function requiredTarget(host: HTMLElement, selector: string): HTMLElement {
	const element = host.querySelector<HTMLElement>(selector);
	if (element === null) throw new Error(`missing clipping target: ${selector}`);
	return element;
}

function clippingMeasurement(element: HTMLElement): {
	scrollWidth: number;
	clientWidth: number;
} {
	return {
		scrollWidth: element.scrollWidth,
		clientWidth: element.clientWidth,
	};
}

function clippingInput(measurement: {
	scrollWidth: number;
	clientWidth: number;
}): string {
	return `scrollWidth=${measurement.scrollWidth};clientWidth=${measurement.clientWidth}`;
}

function fits(element: HTMLElement): boolean {
	return element.scrollWidth <= element.clientWidth;
}

function plantOverflow(
	host: HTMLElement,
	target: HTMLElement,
	caseName: string,
): HTMLElement {
	const planted = target.cloneNode(false) as HTMLElement;
	planted.dataset.phase78Negative = caseName;
	planted.setAttribute("aria-hidden", "true");
	planted.textContent = "Phase78OverflowControl".repeat(32);
	Object.assign(planted.style, {
		position: "absolute",
		insetInlineStart: "-10000px",
		display: "block",
		boxSizing: "content-box",
		width: "1px",
		minWidth: "0",
		maxWidth: "1px",
		padding: "0",
		border: "0",
		overflow: "visible",
		whiteSpace: "nowrap",
		textOverflow: "clip",
	});
	host.append(planted);
	return planted;
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

	expect([...consumedPending]).toHaveLength(
		pending.filter((row) => row.case === "outcome-color").length,
	);
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

test("the four named clipping contracts hold across locales and themes", async () => {
	const cases = [
		{
			name: "size-cell",
			story: "file-list-filerow--huge-size",
			component: HugeSize,
			selector: ".file-table__cell--size",
		},
		{
			name: "secondary-summary",
			story: "file-list-filerow--unchanged",
			component: LocalizedUnchanged,
			selector: ".file-table__error-summary",
		},
		{
			name: "after-count",
			story: "file-list-filerow--huge-tag-counts",
			component: HugeTagCounts,
			selector: ".file-table__row > .file-table__cell:nth-of-type(6)",
		},
		{
			name: "empty-state-min-height",
			story: "ui-emptystate--copy-mode-on",
			component: LocalizedEmptyState,
			selector: ".empty-state",
		},
	] as const;
	const clipPending = pending.filter((row) => row.case !== "outcome-color");
	const consumedPending = new Set<PendingObservation>();
	const unpended: Observation[] = [];

	for (const theme of ["light", "dark"] as const) {
		for (const scene of LOCALE_SCENES) {
			for (const current of cases) {
				const host = await renderStory(current.component, theme, scene.locale);
				expect(document.documentElement.lang).toBe(scene.locale);
				expect(document.documentElement.dir).toBe(scene.dir);
				const target = requiredTarget(host, current.selector);
				const measured = clippingMeasurement(target);
				const observation: Observation = {
					case: current.name,
					story: current.story,
					selector: current.selector,
					theme,
					locale: scene.locale,
					actual: fits(target) ? OVERFLOW_EXPECTED : clippingInput(measured),
					expected: OVERFLOW_EXPECTED,
				};
				const result = clipOutcome(observation);
				if (result === "fail") unpended.push(observation);
				const matched = exactPendingMatch(observation);
				if (matched !== undefined) consumedPending.add(matched);

				const planted = plantOverflow(host, target, current.name);
				const plantedMeasurement = clippingMeasurement(planted);
				const plantedObservation: Observation = {
					case: `planted-${current.name}`,
					story: current.story,
					selector: `[data-phase78-negative="${current.name}"]`,
					theme,
					locale: scene.locale,
					actual: clippingInput(plantedMeasurement),
					expected: OVERFLOW_EXPECTED,
				};
				expect(plantedMeasurement.scrollWidth).toBeGreaterThan(
					plantedMeasurement.clientWidth,
				);
				expect(plantedMeasurement.scrollWidth).toBeGreaterThan(
					measured.scrollWidth,
				);
				expect(fits(planted)).toBe(false);
				expect(exactPendingMatch(plantedObservation)).toBeUndefined();
				expect(clipOutcome(plantedObservation)).toBe("fail");

				if (current.name === "empty-state-min-height") {
					const frame = host.firstElementChild;
					if (!(frame instanceof HTMLElement))
						throw new Error("empty-state story frame missing");
					expect(getComputedStyle(target).minBlockSize).toBe("min-content");
					expect(frame.getBoundingClientRect().height).toBeGreaterThanOrEqual(
						312,
					);
				}
			}
		}
	}

	if (unpended.length > 0) {
		console.info(
			`Phase 78 measured clipping exceptions: ${JSON.stringify(unpended)}`,
		);
	}
	expect(unpended).toEqual([]);
	expect(consumedPending.size).toBe(clipPending.length);
});
