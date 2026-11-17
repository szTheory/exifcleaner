import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
	contrastRatio,
	parseColour,
} from "../tests/renderer/contrast/wcag.mjs";
import {
	evaluate,
	pairsShapeProblems,
	resolveColour,
	themeTokens,
} from "../tests/renderer/contrast/contrast_model.mjs";
import type { ContrastPairsDocument } from "../tests/renderer/contrast/contrast_model.mjs";
import * as fileRowStories from "../src/renderer/components/file-list/FileRow.stories";
import * as segmentedStories from "../src/renderer/components/settings/SegmentedControl.stories";
import * as toggleStories from "../src/renderer/components/settings/ToggleSwitch.stories";
import * as typePillStories from "../src/renderer/components/ui/TypePill.stories";
import preview from "./preview";

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
const PLATFORM_MIX =
	"color-mix(in srgb, GrayText 90%, CanvasText 10%)" as const;
const PLATFORM_INDICATOR_MIX =
	"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)" as const;
const normalMeasurements: Array<Record<string, unknown>> = [];
const forcedObservations: Array<Record<string, unknown>> = [];
let forcedGateComplete = false;

const ORIGINAL_FINDING_FINGERPRINTS = [
	"contrast-gap|ui-statusbar--all-cleaned|accent-text-on-surface-hover-light",
	"contrast-gap|ui-dropzone--drag-over|drop-zone-border-on-surface-dark",
	"contrast-gap|ui-statusicon--failed|error-icon-on-item-hover-light",
	"contrast-gap|ui-statusicon--failed|error-icon-on-item-hover-dark",
	"contrast-gap|settings-segmentedcontrol--keyboard-focus|focus-ring-on-surface-dark",
	"contrast-gap|settings-segmentedcontrol--keyboard-focus|focus-ring-on-error-bg-dark",
	"contrast-gap|settings-segmentedcontrol--keyboard-focus|focus-ring-on-item-hover-dark",
];

type OpaqueRgb = { r: number; g: number; b: number; a: number };
type PaintedColor = { raw: string; rgb: OpaqueRgb };

function canonicalPaint(raw: string): PaintedColor {
	const surface = document.createElement("canvas");
	surface.width = 1;
	surface.height = 1;
	const context = surface.getContext("2d", { willReadFrequently: true });
	if (context === null) throw new Error("canvas 2D context is unavailable");
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = raw;
	context.fillRect(0, 0, 1, 1);
	const pixel = context.getImageData(0, 0, 1, 1).data;
	const rgb = {
		r: pixel[0] ?? 0,
		g: pixel[1] ?? 0,
		b: pixel[2] ?? 0,
		a: pixel[3] ?? 0,
	};
	expect(rgb.a, `opaque computed color ${raw}`).toBe(255);
	return { raw, rgb };
}

function backgroundPaint(element: Element): PaintedColor {
	return canonicalPaint(getComputedStyle(element).backgroundColor);
}

function assertPinnedWhiteThumb(
	actual: PaintedColor,
	primitive: PaintedColor,
	primitiveValue: string,
): void {
	expect(primitiveValue.toUpperCase()).toBe("#FFFFFF");
	expect(actual.rgb).toEqual({ r: 255, g: 255, b: 255, a: 255 });
	expect(primitive.rgb).toEqual(actual.rgb);
}

function assertOffTrackGate(input: {
	productionExpression: string;
	track: PaintedColor;
	mixProbe: PaintedColor;
	ground: PaintedColor;
	raised: PaintedColor;
	thumb: PaintedColor;
	cleanWhiteProbe: PaintedColor;
	cleanWhitePrimitive: string;
}): Record<string, number> {
	expect(input.productionExpression.replace(/\s+/g, "").toLowerCase()).toBe(
		PLATFORM_MIX.replace(/\s+/g, "").toLowerCase(),
	);
	expect(input.track.rgb).toEqual(input.mixProbe.rgb);
	assertPinnedWhiteThumb(
		input.thumb,
		input.cleanWhiteProbe,
		input.cleanWhitePrimitive,
	);
	const ratios = {
		trackToGround: contrastRatio(input.track.rgb, input.ground.rgb),
		trackToRaised: contrastRatio(input.track.rgb, input.raised.rgb),
		thumbToTrack: contrastRatio(input.thumb.rgb, input.track.rgb),
	};
	for (const [relationship, ratio] of Object.entries(ratios))
		expect(ratio, `${relationship} contrast ratio`).toBeGreaterThanOrEqual(3);
	return ratios;
}

function rgbCss(color: OpaqueRgb): string {
	return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
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
		expect(getComputedStyle(onTrack).backgroundColor).toBe(colors.Highlight);
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
		expect(getComputedStyle(indicator).backgroundColor).toBe(colors.Highlight);
		expectOutline(active, "Highlight", colors, "active segment");
		expect(getComputedStyle(active).color).toBe(colors.HighlightText);
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
		forcedObservations.push({
			theme,
			forcedColors: window.matchMedia("(forced-colors: active)").matches,
			colorScheme: getComputedStyle(document.documentElement).colorScheme,
			dataTheme: document.documentElement.getAttribute("data-theme"),
			systemColors: colors,
			controls: {
				toggleOff: {
					track: getComputedStyle(offTrack).backgroundColor,
					trackOutline: getComputedStyle(offTrack).outlineColor,
					thumb: getComputedStyle(offThumb).backgroundColor,
					thumbOutline: getComputedStyle(offThumb).outlineColor,
				},
				toggleOn: {
					track: getComputedStyle(onTrack).backgroundColor,
					trackOutline: getComputedStyle(onTrack).outlineColor,
					thumb: getComputedStyle(onThumb).backgroundColor,
					thumbOutline: getComputedStyle(onThumb).outlineColor,
				},
				segmented: {
					group: getComputedStyle(group).backgroundColor,
					activeIndicator: getComputedStyle(indicator).backgroundColor,
					activeSegment: getComputedStyle(active).backgroundColor,
					inactiveSegment: getComputedStyle(inactive).backgroundColor,
				},
				badge: {
					background: getComputedStyle(pill).backgroundColor,
					foreground: getComputedStyle(pill).color,
				},
				selectedRow: {
					background: getComputedStyle(row).backgroundColor,
					foreground: getComputedStyle(name).color,
					outline: getComputedStyle(row).outlineColor,
				},
			},
			geometryPreserved: true,
			selectedRowRemoval: {
				rejectedWithoutStylesheet: true,
				passedAfterRestore: true,
			},
		});
		rowCanvas.remove();
	}
	forcedGateComplete = true;
});

test("normal-color system toggle track is measured in both themes", async () => {
	expect(forcedGateComplete, "forced-colors gate completed").toBe(true);
	const originalTheme: PaletteTheme = window.matchMedia(
		"(prefers-color-scheme: dark)",
	).matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	const liveTokenSource = await commands.readFile(
		"src/renderer/styles/tokens.css",
	);
	expect(liveTokenSource).toContain(
		"--ec-color-platform-indicator: var(--ec-color-accent);",
	);
	expect(liveTokenSource).toContain(
		"--ec-color-platform-indicator: color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%);",
	);
	const measuredSamples: Record<string, { light: string; dark: string }> & {
		"--ec-system-toggle-off-track": Record<PaletteTheme, string>;
		"--ec-system-platform-indicator": Record<PaletteTheme, string>;
	} = {
		"--ec-system-toggle-off-track": { light: "", dark: "" },
		"--ec-system-platform-indicator": { light: "", dark: "" },
	};
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "none");
			let host: HTMLElement | undefined;
			const probeHost = document.createElement("div");
			try {
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(
					false,
				);
				expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(
					theme === "dark",
				);
				host = await runStory((canvasElement) =>
					ToggleOff.run({
						canvasElement,
						globals: { ...ToggleOff.globals, theme },
					}),
				);
				const themeElement = document.documentElement;
				expect(themeElement.getAttribute("data-theme")).toBe(theme);
				expect(getComputedStyle(themeElement).colorScheme).toBe(theme);
				const track = requiredElement<HTMLElement>(
					host,
					".toggle-switch__track",
				);
				const thumb = requiredElement<HTMLElement>(
					host,
					".toggle-switch__thumb",
				);
				expect(track.classList.contains("toggle-switch__track--on")).toBe(
					false,
				);
				probeHost.setAttribute("aria-hidden", "true");
				probeHost.style.position = "fixed";
				probeHost.style.insetBlockStart = "-10000px";
				probeHost.style.insetInlineStart = "-10000px";
				probeHost.style.visibility = "hidden";
				document.body.append(probeHost);
				const grayText = document.createElement("span");
				grayText.style.backgroundColor = "GrayText";
				const canvasText = document.createElement("span");
				canvasText.style.backgroundColor = "CanvasText";
				const mixed = document.createElement("span");
				mixed.className = "palette77-toggle-mix";
				mixed.style.backgroundColor = PLATFORM_MIX;
				const ground = document.createElement("div");
				ground.style.backgroundColor = "var(--ec-color-bg)";
				const raised = document.createElement("div");
				raised.style.backgroundColor = "var(--ec-color-surface)";
				const cleanWhite = document.createElement("span");
				cleanWhite.style.backgroundColor = "var(--ec-brand-clean-white)";
				const platformIndicator = document.createElement("span");
				platformIndicator.style.backgroundColor =
					"var(--ec-color-platform-indicator)";
				const accent = document.createElement("span");
				accent.style.backgroundColor = "var(--ec-color-accent)";
				const indicatorMix = document.createElement("span");
				indicatorMix.style.backgroundColor = PLATFORM_INDICATOR_MIX;
				probeHost.append(
					grayText,
					canvasText,
					mixed,
					ground,
					raised,
					cleanWhite,
					platformIndicator,
					accent,
					indicatorMix,
				);

				const tokenValue = getComputedStyle(themeElement)
					.getPropertyValue("--ec-toggle-off-track")
					.trim();
				const indicatorValue = getComputedStyle(themeElement)
					.getPropertyValue("--ec-color-platform-indicator")
					.trim();
				expect(tokenValue.replace(/\s+/g, "").toLowerCase()).toBe(
					PLATFORM_MIX.replace(/\s+/g, "").toLowerCase(),
				);
				const gray = backgroundPaint(grayText);
				const text = backgroundPaint(canvasText);
				const mixedProbe = backgroundPaint(mixed);
				const actualTrack = backgroundPaint(track);
				const actualThumb = backgroundPaint(thumb);
				const actualGround = backgroundPaint(ground);
				const actualRaised = backgroundPaint(raised);
				const cleanWhiteProbe = backgroundPaint(cleanWhite);
				const indicatorPaint = backgroundPaint(platformIndicator);
				const accentPaint = backgroundPaint(accent);
				const indicatorMixPaint = backgroundPaint(indicatorMix);
				expect(actualTrack.raw).toBe(mixedProbe.raw);
				expect(actualTrack.rgb).toEqual(mixedProbe.rgb);
				for (const channel of ["r", "g", "b"] as const) {
					const expected = gray.rgb[channel] * 0.9 + text.rgb[channel] * 0.1;
					expect(
						Math.abs(mixedProbe.rgb[channel] - expected),
						`${theme} off-track 90/10 ${channel} channel quantization`,
					).toBeLessThanOrEqual(1);
				}
				if (theme === "dark") {
					expect(indicatorPaint.rgb).toEqual(indicatorMixPaint.rgb);
					for (const channel of ["r", "g", "b"] as const) {
						const expected =
							accentPaint.rgb[channel] * 0.9 + text.rgb[channel] * 0.1;
						expect(
							Math.abs(indicatorPaint.rgb[channel] - expected),
							`dark platform indicator 90/10 ${channel} channel quantization`,
						).toBeLessThanOrEqual(1);
					}
				} else {
					expect(indicatorPaint.rgb).toEqual(accentPaint.rgb);
				}
				const primitiveValue = getComputedStyle(themeElement)
					.getPropertyValue("--ec-brand-clean-white")
					.trim();
				const ratios = assertOffTrackGate({
					productionExpression: tokenValue,
					track: actualTrack,
					mixProbe: mixedProbe,
					ground: actualGround,
					raised: actualRaised,
					thumb: actualThumb,
					cleanWhiteProbe,
					cleanWhitePrimitive: primitiveValue,
				});
				const originalGroundBackground = ground.style.backgroundColor;
				const originalTrackBackground = track.style.backgroundColor;
				const originalTokenOverride = themeElement.style.getPropertyValue(
					"--ec-toggle-off-track",
				);
				let lowContrastRejected = false;
				let missingProbeRejected = false;
				let wrongWeightRejected = false;
				try {
					ground.style.backgroundColor = rgbCss(actualTrack.rgb);
					const lowGround = backgroundPaint(ground);
					const lowContrast = contrastRatio(actualTrack.rgb, lowGround.rgb);
					expect(lowContrast).toBe(1);
					expect(() =>
						assertOffTrackGate({
							productionExpression: tokenValue,
							track: actualTrack,
							mixProbe: mixedProbe,
							ground: lowGround,
							raised: actualRaised,
							thumb: actualThumb,
							cleanWhiteProbe,
							cleanWhitePrimitive: primitiveValue,
						}),
					).toThrow();
					lowContrastRejected = true;

					const mixParent = mixed.parentElement;
					if (mixParent === null) throw new Error("mix probe has no parent");
					mixed.remove();
					expect(() =>
						requiredElement(probeHost, ".palette77-toggle-mix"),
					).toThrow();
					missingProbeRejected = true;
					mixParent.append(mixed);

					themeElement.style.setProperty(
						"--ec-toggle-off-track",
						"color-mix(in srgb, GrayText 80%, CanvasText 20%)",
					);
					const wrongWeight = getComputedStyle(themeElement)
						.getPropertyValue("--ec-toggle-off-track")
						.trim();
					expect(() =>
						assertOffTrackGate({
							productionExpression: wrongWeight,
							track: actualTrack,
							mixProbe: mixedProbe,
							ground: actualGround,
							raised: actualRaised,
							thumb: actualThumb,
							cleanWhiteProbe,
							cleanWhitePrimitive: primitiveValue,
						}),
					).toThrow();
					wrongWeightRejected = true;
				} finally {
					track.style.backgroundColor = originalTrackBackground;
					ground.style.backgroundColor = originalGroundBackground;
					if (originalTokenOverride === "")
						themeElement.style.removeProperty("--ec-toggle-off-track");
					else
						themeElement.style.setProperty(
							"--ec-toggle-off-track",
							originalTokenOverride,
						);
					if (!probeHost.contains(mixed)) probeHost.append(mixed);
				}
				expect(
					lowContrastRejected && missingProbeRejected && wrongWeightRejected,
				).toBe(true);
				const restoredRatios = assertOffTrackGate({
					productionExpression: tokenValue,
					track: backgroundPaint(track),
					mixProbe: backgroundPaint(mixed),
					ground: backgroundPaint(ground),
					raised: backgroundPaint(raised),
					thumb: backgroundPaint(thumb),
					cleanWhiteProbe,
					cleanWhitePrimitive: primitiveValue,
				});
				expect(restoredRatios).toEqual(ratios);

				const priorInlineBackground = thumb.style.backgroundColor;
				let nearWhiteContrast = 0;
				let nearWhiteRejected = false;
				try {
					thumb.style.backgroundColor = "rgb(254, 254, 254)";
					const nearWhite = backgroundPaint(thumb);
					nearWhiteContrast = contrastRatio(nearWhite.rgb, actualTrack.rgb);
					expect(nearWhiteContrast).toBeGreaterThanOrEqual(3);
					expect(() =>
						assertPinnedWhiteThumb(nearWhite, cleanWhiteProbe, primitiveValue),
					).toThrow();
					nearWhiteRejected = true;
				} finally {
					thumb.style.backgroundColor = priorInlineBackground;
				}
				const restoredThumb = backgroundPaint(thumb);
				assertPinnedWhiteThumb(restoredThumb, cleanWhiteProbe, primitiveValue);
				measuredSamples["--ec-system-toggle-off-track"][theme] = rgbCss(
					mixedProbe.rgb,
				);
				measuredSamples["--ec-system-platform-indicator"][theme] = rgbCss(
					indicatorPaint.rgb,
				);

				normalMeasurements.push({
					theme,
					forcedColors: window.matchMedia("(forced-colors: active)").matches,
					colorScheme: getComputedStyle(themeElement).colorScheme,
					dataTheme: themeElement.getAttribute("data-theme"),
					productionExpression: tokenValue,
					platformIndicator: {
						expression: indicatorValue,
						paint: indicatorPaint,
						accent: accentPaint,
						mixProbe: indicatorMixPaint,
						consumerProof: "pending-plan-77-06",
					},
					constituents: {
						GrayText: gray,
						CanvasText: text,
					},
					mixProbe: mixedProbe,
					actualTrack,
					ground: actualGround,
					raised: actualRaised,
					thumb: actualThumb,
					cleanWhitePrimitive: primitiveValue,
					cleanWhiteProbe,
					thumbIdentity: true,
					nearWhiteThumbPlant: {
						paint: nearWhiteRejected ? "rgb(254, 254, 254)" : "",
						contrastRatio: nearWhiteContrast,
						contrastPasses: nearWhiteContrast >= 3,
						identityRejected: nearWhiteRejected,
						restoredIdentity: true,
					},
					ratios,
					negativeControls: {
						lowContrastRejected,
						missingProbeRejected,
						wrongWeightRejected,
						restoredGreen: true,
					},
				});
			} finally {
				probeHost.remove();
				host?.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
	const sourcePaths = [
		"src/renderer/styles/tokens.css",
		"src/renderer/styles/toggle_switch.css",
		"src/renderer/styles/forced_colors.css",
		"src/renderer/index.tsx",
		".storybook/preview.tsx",
		"vitest.storybook.config.ts",
		".storybook/forced_colors.test.tsx",
		"tests/renderer/contrast/contrast_model.mjs",
		"tests/renderer/contrast/contrast_pairs.json",
	];
	const sourceTexts = await Promise.all(
		sourcePaths.map((path) => commands.readFile(path)),
	);
	const sourceDigests = Object.fromEntries(
		await Promise.all(
			sourcePaths.map(async (path, index) => [
				path,
				await sha256(sourceTexts[index] ?? ""),
			]),
		),
	);
	const pairsIndex = sourcePaths.indexOf(
		"tests/renderer/contrast/contrast_pairs.json",
	);
	const tokensIndex = sourcePaths.indexOf("src/renderer/styles/tokens.css");
	const pairDoc = JSON.parse(
		sourceTexts[pairsIndex] ?? "{}",
	) as ContrastPairsDocument;
	const tokenSource = sourceTexts[tokensIndex] ?? "";
	expect(pairsShapeProblems(pairDoc)).toEqual([]);
	expect(measuredSamples["--ec-system-toggle-off-track"]).toEqual(
		pairDoc.localTokens["--ec-system-toggle-off-track"],
	);
	expect(measuredSamples["--ec-system-platform-indicator"]).toEqual(
		pairDoc.localTokens["--ec-system-platform-indicator"],
	);
	const tokenMap = themeTokens(tokenSource);
	const resolverNegativeControls: Record<string, boolean> = {};
	for (const theme of THEMES) {
		const sampleDoc = { localTokens: measuredSamples };
		expect(resolveColour(PLATFORM_MIX, theme, tokenMap, sampleDoc)).toEqual(
			parseColour(measuredSamples["--ec-system-toggle-off-track"][theme]),
		);
		expect(
			resolveColour(
				" Color-Mix ( In Srgb, GrayText 90%, CanvasText 10% ) ",
				theme,
				tokenMap,
				sampleDoc,
			),
		).toEqual(
			parseColour(measuredSamples["--ec-system-toggle-off-track"][theme]),
		);
		expect(
			resolveColour(PLATFORM_INDICATOR_MIX, theme, tokenMap, sampleDoc),
		).toEqual(
			parseColour(measuredSamples["--ec-system-platform-indicator"][theme]),
		);
		const missingToggle = structuredClone(sampleDoc);
		delete missingToggle.localTokens["--ec-system-toggle-off-track"][theme];
		const malformed = structuredClone(sampleDoc);
		malformed.localTokens["--ec-system-toggle-off-track"][theme] =
			"rgba(115, 115, 115, 0.5)";
		const outOfRange = structuredClone(sampleDoc);
		outOfRange.localTokens["--ec-system-toggle-off-track"][theme] =
			"rgb(999, 115, 115)";
		const missingIndicator = structuredClone(sampleDoc);
		delete missingIndicator.localTokens["--ec-system-platform-indicator"][
			theme
		];
		for (const unsupported of [
			PLATFORM_MIX.replace("90%", "80%"),
			PLATFORM_MIX.replace("GrayText", "ButtonText"),
			PLATFORM_MIX.replace("srgb", "display-p3"),
		])
			expect(resolveColour(unsupported, theme, tokenMap, sampleDoc)).toBeNull();
		expect(
			resolveColour(PLATFORM_MIX, theme, tokenMap, missingToggle),
		).toBeNull();
		expect(resolveColour(PLATFORM_MIX, theme, tokenMap, malformed)).toBeNull();
		expect(resolveColour(PLATFORM_MIX, theme, tokenMap, outOfRange)).toBeNull();
		expect(
			resolveColour(PLATFORM_INDICATOR_MIX, theme, tokenMap, missingIndicator),
		).toBeNull();
		resolverNegativeControls[theme] = true;
	}
	const staticResults = evaluate(pairDoc, tokenSource);
	expect(staticResults.length).toBeGreaterThan(0);
	expect(staticResults.every((result) => result.pass)).toBe(true);
	const currentPairFingerprints = staticResults.map(
		({ pair, backdrop, theme, rule, fingerprint }) => ({
			pair,
			backdrop,
			theme,
			rule,
			fingerprint,
		}),
	);
	await commands.writeFile(
		"node_modules/.cache/palette77-platform.json",
		JSON.stringify(
			{
				browser: {
					userAgent: navigator.userAgent,
					platform: navigator.platform,
				},
				forcedObservations,
				normalObservations: normalMeasurements,
				approvedExpressions: {
					offTrack: PLATFORM_MIX,
					platformIndicatorDark: PLATFORM_INDICATOR_MIX,
					weights: [0.9, 0.1],
					localTokenSamples: measuredSamples,
				},
				originalFindingFingerprints: ORIGINAL_FINDING_FINGERPRINTS,
				currentPairFingerprints,
				proposedPromiseIds: (pairDoc.proposed ?? []).map(({ id }) => id),
				resolverNegativeControls,
				forcedRowRemovalRestoration: forcedObservations.map(
					({ theme, selectedRowRemoval }) => ({ theme, selectedRowRemoval }),
				),
				sourceDigests,
			},
			null,
			2,
		),
	);
});
