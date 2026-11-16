import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import { commands } from "vitest/browser";
import preview from "./preview";
import * as fileRowStories from "../src/renderer/components/file-list/FileRow.stories";
import * as segmentedStories from "../src/renderer/components/settings/SegmentedControl.stories";
import * as toggleStories from "../src/renderer/components/settings/ToggleSwitch.stories";
import * as typePillStories from "../src/renderer/components/ui/TypePill.stories";

type PaletteTheme = "light" | "dark";
type ForcedColors = "none" | "active";
type SystemKeyword =
	"Canvas" | "CanvasText" | "ButtonText" | "Highlight" | "HighlightText";
type SystemColors = Record<SystemKeyword, string>;

declare module "vitest/browser" {
	interface BrowserCommands {
		setPaletteMedia: (
			theme: PaletteTheme,
			forcedColors: ForcedColors,
		) => Promise<void>;
	}
}

setProjectAnnotations([a11yAnnotations, preview]);

const {
	Off: ToggleOff,
	On: ToggleOn,
	LongLabels: ToggleLongLabels,
} = composeStories(toggleStories);
const { LightActive: SegmentedLightActive, LongLabels: SegmentedLongLabels } =
	composeStories(segmentedStories);
const { Neutral: NeutralTypePill } = composeStories(typePillStories);
const { CleanedExpanded } = composeStories(fileRowStories);

const THEMES: PaletteTheme[] = ["light", "dark"];
const SYSTEM_KEYWORDS: SystemKeyword[] = [
	"Canvas",
	"CanvasText",
	"ButtonText",
	"Highlight",
	"HighlightText",
];

function canvas(): HTMLElement {
	const host = document.createElement("div");
	document.body.append(host);
	return host;
}

async function runStory(
	render: (canvasElement: HTMLElement) => Promise<unknown>,
): Promise<HTMLElement> {
	const host = canvas();
	try {
		await render(host);
		return host;
	} catch (error) {
		host.remove();
		throw error;
	}
}

function requiredElement<T extends Element>(
	host: ParentNode,
	selector: string,
): T {
	const element = host.querySelector<T>(selector);
	if (element === null)
		throw new Error(`missing forced-colors target: ${selector}`);
	return element;
}

function systemColors(): SystemColors {
	const host = document.createElement("div");
	host.setAttribute("aria-hidden", "true");
	host.style.position = "fixed";
	host.style.insetBlockStart = "-10000px";
	host.style.insetInlineStart = "-10000px";
	host.style.visibility = "hidden";
	document.body.append(host);
	try {
		return Object.fromEntries(
			SYSTEM_KEYWORDS.map((keyword) => {
				const probe = document.createElement("span");
				probe.style.color = keyword;
				host.append(probe);
				return [keyword, getComputedStyle(probe).color];
			}),
		) as SystemColors;
	} finally {
		host.remove();
	}
}

function expectOutline(
	element: Element,
	keyword: SystemKeyword,
	colors: SystemColors,
	label: string,
): void {
	const style = getComputedStyle(element);
	expect(style.outlineStyle, `${label} outline style`).toBe("solid");
	expect(style.outlineWidth, `${label} outline width`).toBe("1px");
	expect(style.outlineColor, `${label} outline color`).toBe(colors[keyword]);
}

function expectDefaultColorAdjustment(element: Element, label: string): void {
	expect(
		getComputedStyle(element).getPropertyValue("forced-color-adjust"),
		`${label} forced-color-adjust`,
	).not.toBe("none");
}

function geometry(element: HTMLElement): Record<string, unknown> {
	const rect = element.getBoundingClientRect();
	const style = getComputedStyle(element);
	return {
		text: element.textContent,
		width: rect.width,
		height: rect.height,
		clientWidth: element.clientWidth,
		clientHeight: element.clientHeight,
		scrollWidth: element.scrollWidth,
		scrollHeight: element.scrollHeight,
		whiteSpace: style.whiteSpace,
		overflow: style.overflow,
		textOverflow: style.textOverflow,
		lineHeight: style.lineHeight,
	};
}

function toggleGeometry(host: HTMLElement): Record<string, unknown> {
	const root = requiredElement<HTMLElement>(host, ".toggle-switch");
	const text = requiredElement<HTMLElement>(host, ".toggle-switch__text");
	const label = requiredElement<HTMLElement>(host, ".toggle-switch__label");
	const description = requiredElement<HTMLElement>(
		host,
		".toggle-switch__description",
	);
	const track = requiredElement<HTMLElement>(host, ".toggle-switch__track");
	return {
		root: geometry(root),
		text: geometry(text),
		label: geometry(label),
		description: geometry(description),
		track: geometry(track),
	};
}

function segmentedGeometry(host: HTMLElement): Record<string, unknown> {
	const group = requiredElement<HTMLElement>(host, ".segmented-control");
	return {
		group: geometry(group),
		segments: [
			...group.querySelectorAll<HTMLElement>(".segmented-control__segment"),
		].map(geometry),
		labels: [
			...group.querySelectorAll<HTMLElement>(".segmented-control__label"),
		].map(geometry),
	};
}

function expectSelectedRow(row: HTMLElement, colors: SystemColors): void {
	const style = getComputedStyle(row);
	expect(style.backgroundColor, "selected row background").toBe(
		colors.Highlight,
	);
	expect(style.color, "selected row foreground").toBe(colors.HighlightText);
	expectOutline(row, "Highlight", colors, "selected row");
}

function forcedColorsStylesheet(): CSSStyleSheet {
	const sheet = [...document.styleSheets].find((candidate) => {
		try {
			return [...candidate.cssRules].some((rule) => {
				const css = rule.cssText;
				return (
					css.includes("forced-colors: active") &&
					css.includes('.file-table__row[aria-expanded="true"]')
				);
			});
		} catch {
			return false;
		}
	});
	if (sheet === undefined) {
		throw new Error(
			"dedicated forced-colors stylesheet was not found by its rules",
		);
	}
	return sheet;
}

test("forced-colors maps real controls to system colors in light and dark modes", async () => {
	expect(window.matchMedia("(forced-colors: active)").matches).toBe(true);

	for (const theme of THEMES) {
		await commands.setPaletteMedia(theme, "none");
		expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(
			theme === "dark",
		);
		expect(window.matchMedia("(forced-colors: active)").matches).toBe(false);

		const toggleLayout = await runStory((canvasElement) =>
			ToggleLongLabels.run({
				canvasElement,
				globals: { ...ToggleLongLabels.globals, theme },
			}),
		);
		const toggleBefore = toggleGeometry(toggleLayout);
		await commands.setPaletteMedia(theme, "active");
		expect(window.matchMedia("(forced-colors: active)").matches).toBe(true);
		expect(toggleGeometry(toggleLayout)).toEqual(toggleBefore);
		toggleLayout.remove();

		await commands.setPaletteMedia(theme, "none");
		const segmentedLayout = await runStory((canvasElement) =>
			SegmentedLongLabels.run({
				canvasElement,
				globals: { ...SegmentedLongLabels.globals, theme },
			}),
		);
		const segmentedBefore = segmentedGeometry(segmentedLayout);
		await commands.setPaletteMedia(theme, "active");
		expect(window.matchMedia("(forced-colors: active)").matches).toBe(true);
		expect(segmentedGeometry(segmentedLayout)).toEqual(segmentedBefore);
		segmentedLayout.remove();

		const colors = systemColors();
		const offCanvas = await runStory((canvasElement) =>
			ToggleOff.run({
				canvasElement,
				globals: { ...ToggleOff.globals, theme },
			}),
		);
		const offTrack = requiredElement<HTMLElement>(
			offCanvas,
			".toggle-switch__track",
		);
		const offThumb = requiredElement<HTMLElement>(
			offCanvas,
			".toggle-switch__thumb",
		);
		expect(offTrack.classList.contains("toggle-switch__track--on")).toBe(false);
		expect(getComputedStyle(offTrack).backgroundColor).toBe(colors.Canvas);
		expectOutline(offTrack, "ButtonText", colors, "toggle off track");
		expect(getComputedStyle(offThumb).backgroundColor).toBe(colors.Canvas);
		expectOutline(offThumb, "ButtonText", colors, "toggle off thumb");
		expectDefaultColorAdjustment(offTrack, "toggle off track");
		expectDefaultColorAdjustment(offThumb, "toggle off thumb");
		expect(
			getComputedStyle(requiredElement(offCanvas, ".toggle-switch__label"))
				.color,
		).toBe(colors.CanvasText);
		expect(
			getComputedStyle(
				requiredElement(offCanvas, ".toggle-switch__description"),
			).color,
		).toBe(colors.CanvasText);
		offCanvas.remove();

		const onCanvas = await runStory((canvasElement) =>
			ToggleOn.run({
				canvasElement,
				globals: { ...ToggleOn.globals, theme },
			}),
		);
		const onTrack = requiredElement<HTMLElement>(
			onCanvas,
			".toggle-switch__track",
		);
		const onThumb = requiredElement<HTMLElement>(
			onCanvas,
			".toggle-switch__thumb",
		);
		expect(onTrack.classList.contains("toggle-switch__track--on")).toBe(true);
		expect(getComputedStyle(onTrack).backgroundColor).toBe(colors.Canvas);
		expectOutline(onTrack, "Highlight", colors, "toggle on track");
		expect(getComputedStyle(onThumb).backgroundColor).toBe(colors.Canvas);
		expectOutline(onThumb, "ButtonText", colors, "toggle on thumb");
		expectDefaultColorAdjustment(onTrack, "toggle on track");
		onCanvas.remove();

		const segmentedCanvas = await runStory((canvasElement) =>
			SegmentedLightActive.run({
				canvasElement,
				globals: { ...SegmentedLightActive.globals, theme },
			}),
		);
		const group = requiredElement<HTMLElement>(
			segmentedCanvas,
			".segmented-control",
		);
		const indicator = requiredElement<HTMLElement>(
			segmentedCanvas,
			".segmented-control__indicator",
		);
		const active = requiredElement<HTMLElement>(
			segmentedCanvas,
			'.segmented-control__segment[aria-checked="true"]',
		);
		const inactive = requiredElement<HTMLElement>(
			segmentedCanvas,
			'.segmented-control__segment[aria-checked="false"]',
		);
		expect(
			active.classList.contains("segmented-control__segment--active"),
		).toBe(true);
		expect(getComputedStyle(group).backgroundColor).toBe(colors.Canvas);
		expectOutline(group, "CanvasText", colors, "segmented group");
		expect(getComputedStyle(indicator).backgroundColor).toBe(colors.Canvas);
		expectOutline(active, "Highlight", colors, "active segment");
		expect(getComputedStyle(active).color).toBe(colors.CanvasText);
		expect(getComputedStyle(inactive).color).toBe(colors.ButtonText);
		expectDefaultColorAdjustment(group, "segmented group");
		segmentedCanvas.remove();

		const pillCanvas = await runStory((canvasElement) =>
			NeutralTypePill.run({
				canvasElement,
				globals: { ...NeutralTypePill.globals, theme },
			}),
		);
		const pill = requiredElement<HTMLElement>(pillCanvas, ".type-pill");
		expect(getComputedStyle(pill).backgroundColor).toBe(colors.Canvas);
		expect(getComputedStyle(pill).color).toBe(colors.CanvasText);
		expectOutline(pill, "CanvasText", colors, "file type badge");
		expectDefaultColorAdjustment(pill, "file type badge");
		pillCanvas.remove();

		const rowCanvas = await runStory((canvasElement) =>
			CleanedExpanded.run({
				canvasElement,
				globals: { ...CleanedExpanded.globals, theme },
			}),
		);
		const row = requiredElement<HTMLElement>(
			rowCanvas,
			'.file-table__row[aria-expanded="true"]',
		);
		const name = requiredElement<HTMLElement>(row, ".file-table__name-text");
		expect(getComputedStyle(name).color).toBe(colors.HighlightText);
		expectDefaultColorAdjustment(row, "selected row");
		expectSelectedRow(row, colors);

		const sheet = forcedColorsStylesheet();
		const wasDisabled = sheet.disabled;
		try {
			sheet.disabled = true;
			expect(() => expectSelectedRow(row, colors)).toThrow();
		} finally {
			sheet.disabled = wasDisabled;
		}
		expectSelectedRow(row, colors);
		console.info(
			"forced-colors selected-row removal control: red without the stylesheet; green after restoration",
		);
		rowCanvas.remove();
	}
});
