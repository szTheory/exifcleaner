import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
	evaluate,
	pairsShapeProblems,
	proposedResults,
} from "../tests/renderer/contrast/contrast_model.mjs";
import type { ContrastPairsDocument } from "../tests/renderer/contrast/contrast_model.mjs";
import { contrastRatio } from "../tests/renderer/contrast/wcag.mjs";
import * as segmentedStories from "../src/renderer/components/settings/SegmentedControl.stories";
import * as toggleStories from "../src/renderer/components/settings/ToggleSwitch.stories";
import * as dropZoneStories from "../src/renderer/components/ui/DropZone.stories";
import preview from "./preview";

type PaletteTheme = "light" | "dark";
type ForcedColors = "none" | "active";
type Rgb = { r: number; g: number; b: number; a: number };
type Paint = { raw: string; rgb: Rgb };

declare module "vitest/browser" {
	interface BrowserCommands {
		setPaletteMedia: (
			theme: PaletteTheme,
			forcedColors: ForcedColors,
		) => Promise<void>;
	}
}

setProjectAnnotations([a11yAnnotations, preview]);

const { KeyboardFocus } = composeStories(segmentedStories);
const { On: ToggleOn } = composeStories(toggleStories);
const { DragOver: DropZoneDragOver } = composeStories(dropZoneStories);
const THEMES: PaletteTheme[] = ["light", "dark"];
const DARK_INDICATOR_EXPRESSION =
	"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)";
const INDICATOR_SOURCE_PATHS = [
	"src/renderer/components/settings/ToggleSwitch.stories.tsx",
	"src/renderer/components/settings/ToggleSwitch.tsx",
	"src/renderer/styles/toggle_switch.css",
	"src/renderer/components/settings/SegmentedControl.stories.tsx",
	"src/renderer/components/settings/SegmentedControl.tsx",
	"src/renderer/styles/segmented_control.css",
	"src/renderer/components/ui/DropZone.stories.tsx",
	"src/renderer/components/ui/DropZone.tsx",
	"src/renderer/styles/drop_zone.css",
	"src/renderer/styles/tokens.css",
	".storybook/platform_indicators.test.tsx",
	".storybook/forced_colors.test.tsx",
	"vitest.storybook.config.ts",
	".storybook/preview.tsx",
	"src/renderer/index.tsx",
	"src/renderer/styles/forced_colors.css",
	"tests/renderer/contrast/contrast_model.mjs",
	"tests/renderer/contrast/contrast_pairs.json",
	"tests/renderer/contrast/wcag.mjs",
	"src/domain/accent_color.ts",
];
const focusObservations: Array<Record<string, unknown>> = [];
const toggleObservations: Array<Record<string, unknown>> = [];
const forcedColorObservations: Array<Record<string, unknown>> = [];
const dropObservations: Array<Record<string, unknown>> = [];
let focusGateComplete = false;
let toggleGateComplete = false;
let forcedGateComplete = false;
let forcedFocusComplete = false;
let forcedDropComplete = false;
let dropGateComplete = false;

function canonicalPaint(raw: string): Paint {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (context === null) throw new Error("canvas 2D context is unavailable");
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = raw;
	context.fillRect(0, 0, 1, 1);
	const pixel = context.getImageData(0, 0, 1, 1).data;
	return {
		raw,
		rgb: {
			r: pixel[0] ?? 0,
			g: pixel[1] ?? 0,
			b: pixel[2] ?? 0,
			a: pixel[3] ?? 0,
		},
	};
}

function colorProbe(value: string, host: HTMLElement): Paint {
	const probe = document.createElement("span");
	probe.setAttribute("aria-hidden", "true");
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.color = value;
	host.append(probe);
	try {
		return canonicalPaint(getComputedStyle(probe).color);
	} finally {
		probe.remove();
	}
}

function backgroundProbe(value: string, host: HTMLElement): Paint {
	const probe = document.createElement("span");
	probe.setAttribute("aria-hidden", "true");
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.backgroundColor = value;
	host.append(probe);
	try {
		return canonicalPaint(getComputedStyle(probe).backgroundColor);
	} finally {
		probe.remove();
	}
}

function required<T extends Element>(host: ParentNode, selector: string): T {
	const element = host.querySelector<T>(selector);
	if (element === null)
		throw new Error(`missing platform indicator target: ${selector}`);
	return element;
}

function expectOpaque(color: Paint, label: string): void {
	expect(color.rgb.a, `${label} is opaque`).toBe(255);
}

function sameRgb(left: Rgb, right: Rgb): boolean {
	return (
		left.r === right.r &&
		left.g === right.g &&
		left.b === right.b &&
		left.a === right.a
	);
}

function expectColorWithinOne(
	actual: Paint,
	expected: Paint,
	label: string,
): void {
	expectOpaque(actual, label);
	expectOpaque(expected, `${label} expected`);
	for (const channel of ["r", "g", "b"] as const) {
		expect(
			Math.abs(actual.rgb[channel] - expected.rgb[channel]),
			`${label} ${channel} sRGB quantization`,
		).toBeLessThanOrEqual(1);
	}
}

function sRgbMix(accent: Paint, canvasText: Paint): Paint {
	return canonicalPaint(
		`rgb(${Math.round(accent.rgb.r * 0.9 + canvasText.rgb.r * 0.1)}, ${Math.round(accent.rgb.g * 0.9 + canvasText.rgb.g * 0.1)}, ${Math.round(accent.rgb.b * 0.9 + canvasText.rgb.b * 0.1)})`,
	);
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

type SourceInput = { path: string; sha256: string };

async function readIndicatorSources(): Promise<{
	texts: string[];
	inputs: SourceInput[];
	digests: Record<string, string>;
}> {
	expect(INDICATOR_SOURCE_PATHS).toHaveLength(20);
	expect(new Set(INDICATOR_SOURCE_PATHS).size).toBe(20);
	const texts = await Promise.all(
		INDICATOR_SOURCE_PATHS.map((path) => commands.readFile(path)),
	);
	texts.forEach((source, index) => {
		expect(
			source.length,
			`source input ${INDICATOR_SOURCE_PATHS[index]}`,
		).toBeGreaterThan(0);
	});
	const inputs = await Promise.all(
		INDICATOR_SOURCE_PATHS.map(async (path, index) => ({
			path,
			sha256: await sha256(texts[index] ?? ""),
		})),
	);
	return {
		texts,
		inputs,
		digests: Object.fromEntries(
			inputs.map(({ path, sha256: digest }) => [path, digest]),
		),
	};
}

function assertSourceProofBindings(record: {
	sourceProof?: { algorithm?: string; inputs?: SourceInput[] };
	sourceDigests?: Record<string, string>;
}): void {
	const inputs = record.sourceProof?.inputs;
	expect(record.sourceProof?.algorithm).toBe("SHA-256");
	expect(inputs).toHaveLength(INDICATOR_SOURCE_PATHS.length);
	if (inputs === undefined) throw new Error("source proof inputs are missing");
	const paths = inputs.map(({ path }) => path);
	expect(new Set(paths).size).toBe(INDICATOR_SOURCE_PATHS.length);
	expect(paths).toEqual(INDICATOR_SOURCE_PATHS);
	const sourceDigests = record.sourceDigests;
	if (sourceDigests === undefined)
		throw new Error("source digest map is missing");
	expect(Object.keys(sourceDigests).sort()).toEqual(
		[...INDICATOR_SOURCE_PATHS].sort(),
	);
	for (const input of inputs) {
		expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(sourceDigests[input.path]).toBe(input.sha256);
	}
}

function assertSourceProofMatchesCurrent(
	record: {
		sourceProof?: { algorithm?: string; inputs?: SourceInput[] };
		sourceDigests?: Record<string, string>;
	},
	currentDigests: Record<string, string>,
): void {
	assertSourceProofBindings(record);
	expect(record.sourceDigests).toEqual(currentDigests);
	for (const input of record.sourceProof?.inputs ?? [])
		expect(input.sha256).toBe(currentDigests[input.path]);
}

function rect(element: Element): Record<string, number> {
	const bounds = element.getBoundingClientRect();
	return {
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		clientWidth: element instanceof HTMLElement ? element.clientWidth : 0,
		clientHeight: element instanceof HTMLElement ? element.clientHeight : 0,
		scrollWidth: element instanceof HTMLElement ? element.scrollWidth : 0,
		scrollHeight: element instanceof HTMLElement ? element.scrollHeight : 0,
	};
}

function selectorLabel(element: Element): string {
	const classes =
		element instanceof HTMLElement && typeof element.className === "string"
			? element.className.trim().replace(/\s+/g, ".")
			: "";
	return `${element.tagName.toLowerCase()}${classes === "" ? "" : `.${classes}`}`;
}

type AdjacentPaint = {
	position: string;
	point: { x: number; y: number };
	source: string;
	stack: string[];
	paint: Paint;
};

function paintAt(x: number, y: number, position: string): AdjacentPaint {
	const stack = document.elementsFromPoint(x, y);
	for (const element of stack) {
		const raw = getComputedStyle(element).backgroundColor;
		const paint = canonicalPaint(raw);
		if (paint.rgb.a === 255) {
			return {
				position,
				point: { x, y },
				source: selectorLabel(element),
				stack: stack.map(selectorLabel),
				paint,
			};
		}
		if (paint.rgb.a !== 0)
			throw new Error(
				`unresolved translucent boundary paint at ${position}: ${raw}`,
			);
	}
	throw new Error(
		`no opaque rendered boundary paint at ${position} (${x}, ${y})`,
	);
}

function focusBoundaries(radio: HTMLElement): AdjacentPaint[] {
	const bounds = radio.getBoundingClientRect();
	const offset = 2;
	const width = 2;
	const middleX = bounds.left + bounds.width / 2;
	const middleY = bounds.top + bounds.height / 2;
	return [
		paintAt(middleX, bounds.top - 1, "top-inner"),
		paintAt(middleX, bounds.top - offset - width - 1, "top-outer"),
		paintAt(middleX, bounds.bottom + 1, "bottom-inner"),
		paintAt(middleX, bounds.bottom + offset + width + 1, "bottom-outer"),
		paintAt(bounds.left - 1, middleY, "left-inner"),
		paintAt(bounds.left - offset - width - 1, middleY, "left-outer"),
		paintAt(bounds.right + 1, middleY, "right-inner"),
		paintAt(bounds.right + offset + width + 1, middleY, "right-outer"),
	];
}

const DROP_BOUNDARY_POSITIONS = [
	"top-inner",
	"top-outer",
	"bottom-inner",
	"bottom-outer",
	"left-inner",
	"left-outer",
	"right-inner",
	"right-outer",
];

function dropBoundaries(zone: HTMLElement): AdjacentPaint[] {
	const bounds = zone.getBoundingClientRect();
	const style = getComputedStyle(zone);
	const borderTop = Number.parseFloat(style.borderTopWidth);
	const borderRight = Number.parseFloat(style.borderRightWidth);
	const borderBottom = Number.parseFloat(style.borderBottomWidth);
	const borderLeft = Number.parseFloat(style.borderLeftWidth);
	const middleX = bounds.left + bounds.width / 2;
	const middleY = bounds.top + bounds.height / 2;
	return [
		paintAt(middleX, bounds.top + borderTop + 1, "top-inner"),
		paintAt(middleX, bounds.top - 1, "top-outer"),
		paintAt(middleX, bounds.bottom - borderBottom - 1, "bottom-inner"),
		paintAt(middleX, bounds.bottom + 1, "bottom-outer"),
		paintAt(bounds.left + borderLeft + 1, middleY, "left-inner"),
		paintAt(bounds.left - 1, middleY, "left-outer"),
		paintAt(bounds.right - borderRight - 1, middleY, "right-inner"),
		paintAt(bounds.right + 1, middleY, "right-outer"),
	];
}

function dropSnapshot(zone: HTMLElement) {
	const style = getComputedStyle(zone);
	return {
		bounds: rect(zone),
		borderWidths: [
			style.borderTopWidth,
			style.borderRightWidth,
			style.borderBottomWidth,
			style.borderLeftWidth,
		],
		borderStyles: [
			style.borderTopStyle,
			style.borderRightStyle,
			style.borderBottomStyle,
			style.borderLeftStyle,
		],
		backgroundColor: style.backgroundColor,
		overflowX: style.overflowX,
		overflowY: style.overflowY,
		role: zone.getAttribute("role"),
		label: zone.getAttribute("aria-label"),
		active: zone.classList.contains("drop-zone--active"),
	};
}

function assertDropBoundaryRatios(
	boundaries: AdjacentPaint[],
	indicator: Paint,
	ground: Paint,
	surface: Paint,
	theme: PaletteTheme,
): Record<string, number> {
	expect(boundaries.map(({ position }) => position).sort()).toEqual(
		[...DROP_BOUNDARY_POSITIONS].sort(),
	);
	const ratios: Record<string, number> = {};
	for (const boundary of boundaries) {
		expectOpaque(boundary.paint, `${theme} drop ${boundary.position} backdrop`);
		const inner = boundary.position.endsWith("-inner");
		const expected = inner ? surface : ground;
		expect(
			sameRgb(boundary.paint.rgb, expected.rgb),
			`${theme} drop ${boundary.position} is actual ${inner ? "raised surface" : "renderer ground"} at ${boundary.source}`,
		).toBe(true);
		const ratio = contrastRatio(indicator.rgb, boundary.paint.rgb);
		expect(
			ratio,
			`${theme} drop ${boundary.position} contrast against ${boundary.paint.raw}`,
		).toBeGreaterThanOrEqual(3);
		ratios[boundary.position] = ratio;
	}
	return ratios;
}

function expectDropPaint(input: {
	theme: PaletteTheme;
	productionExpression: string;
	actual: Paint;
	accent: Paint;
	canvasText: Paint;
	mixProbe: Paint;
}): void {
	expectFocusPaint(input);
}

function normalStyleSnapshot(host: HTMLElement, radio: HTMLElement) {
	const group = required<HTMLElement>(host, ".segmented-control");
	const indicator = required<HTMLElement>(
		host,
		".segmented-control__indicator",
	);
	const style = getComputedStyle(radio);
	return {
		group: rect(group),
		groupBackground: getComputedStyle(group).backgroundColor,
		indicator: rect(indicator),
		indicatorBackground: getComputedStyle(indicator).backgroundColor,
		radio: rect(radio),
		outlineStyle: style.outlineStyle,
		outlineWidth: style.outlineWidth,
		outlineOffset: style.outlineOffset,
		checked: radio.getAttribute("aria-checked"),
		tabIndex: radio.getAttribute("tabindex"),
		radioCount: host.querySelectorAll('.segmented-control [role="radio"]')
			.length,
	};
}

function expectExactRoleExpression(
	expression: string,
	theme: PaletteTheme,
): void {
	const normalized = expression.replace(/\s+/g, " ").trim();
	if (theme === "dark") expect(normalized).toBe(DARK_INDICATOR_EXPRESSION);
	else expect(normalized).toBe("var(--ec-color-accent)");
}

function expectFocusPaint(input: {
	theme: PaletteTheme;
	productionExpression: string;
	actual: Paint;
	accent: Paint;
	canvasText: Paint;
	mixProbe: Paint;
}): void {
	expectExactRoleExpression(input.productionExpression, input.theme);
	if (input.theme === "dark") {
		expectColorWithinOne(
			input.mixProbe,
			sRgbMix(input.accent, input.canvasText),
			"90/10 mix probe",
		);
		expect(input.actual.rgb).toEqual(input.mixProbe.rgb);
	} else {
		expect(input.actual.rgb).toEqual(input.accent.rgb);
	}
}

function hostForStory(): HTMLElement {
	const host = document.createElement("div");
	host.style.position = "relative";
	host.style.display = "inline-block";
	host.style.padding = "24px";
	host.style.backgroundColor = "var(--ec-color-bg)";
	document.body.append(host);
	return host;
}

async function renderStory(
	story: {
		run: (context: {
			canvasElement: HTMLElement;
			globals: Record<string, unknown>;
		}) => Promise<unknown>;
		globals?: Record<string, unknown>;
	},
	theme: PaletteTheme,
): Promise<HTMLElement> {
	const host = hostForStory();
	try {
		await story.run({
			canvasElement: host,
			globals: { ...story.globals, theme },
		});
		return host;
	} catch (error) {
		host.remove();
		throw error;
	}
}

function surfaceRgb(themeElement: Element, property: string): Paint {
	const raw = getComputedStyle(themeElement).getPropertyValue(property).trim();
	return backgroundProbe(raw, document.body);
}

function assertBoundaryRatios(
	boundaries: AdjacentPaint[],
	indicator: Paint,
	ground: Paint,
	surface: Paint,
	theme: PaletteTheme,
	label: string,
): Record<string, number> {
	const allowed = [ground.rgb, surface.rgb];
	const ratios: Record<string, number> = {};
	for (const boundary of boundaries) {
		expectOpaque(boundary.paint, `${label} ${boundary.position} backdrop`);
		expect(
			allowed.some((color) =>
				["r", "g", "b", "a"].every(
					(channel) =>
						color[channel as keyof Rgb] ===
						boundary.paint.rgb[channel as keyof Rgb],
				),
			),
			`${theme} ${label} ${boundary.position} is one of the mapped ground/surface colors (${boundary.source})`,
		).toBe(true);
		const ratio = contrastRatio(indicator.rgb, boundary.paint.rgb);
		expect(
			ratio,
			`${theme} ${label} ${boundary.position} ${boundary.paint.raw} contrast`,
		).toBeGreaterThanOrEqual(3);
		ratios[boundary.position] = ratio;
	}
	return ratios;
}

test("real segmented focus boundaries and toggle-on keep the platform indicator role", async () => {
	const originalTheme = window.matchMedia("(prefers-color-scheme: dark)")
		.matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	const rootBg = document.documentElement.style.backgroundColor;
	const bodyBg = document.body.style.backgroundColor;
	const sourceTokens = await commands.readFile(
		"src/renderer/styles/tokens.css",
	);
	const sourceSegmented = await commands.readFile(
		"src/renderer/styles/segmented_control.css",
	);
	expect(
		sourceTokens.match(/--ec-color-platform-indicator:\s*[^;]+;/g),
	).toHaveLength(2);
	expect(sourceTokens).toContain(
		"--ec-color-platform-indicator: var(--ec-color-accent);",
	);
	expect(sourceTokens).toContain(
		"--ec-color-platform-indicator: color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%);",
	);
	expect(sourceSegmented).toMatch(
		/\.segmented-control__segment:focus-visible\s*\{\s*outline: 2px solid var\(--ec-color-platform-indicator\);\s*outline-offset: 2px;\s*\}/,
	);
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "none");
			document.documentElement.style.backgroundColor = "var(--ec-color-bg)";
			document.body.style.backgroundColor = "var(--ec-color-bg)";
			const host = await renderStory(KeyboardFocus, theme);
			try {
				const root = document.documentElement;
				expect(root.getAttribute("data-theme")).toBe(theme);
				expect(getComputedStyle(root).colorScheme).toBe(theme);
				expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(
					theme === "dark",
				);
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(
					false,
				);

				const productionExpression =
					theme === "dark"
						? DARK_INDICATOR_EXPRESSION
						: "var(--ec-color-accent)";
				expectExactRoleExpression(productionExpression, theme);
				const accent = colorProbe("var(--ec-color-accent)", host);
				const canvasText = colorProbe("CanvasText", host);
				const mixProbe = colorProbe(DARK_INDICATOR_EXPRESSION, host);
				const roleProbe = colorProbe(
					"var(--ec-color-platform-indicator)",
					host,
				);
				const ground = surfaceRgb(root, "--ec-color-bg");
				const surface = surfaceRgb(root, "--ec-color-surface");
				[accent, canvasText, mixProbe, roleProbe, ground, surface].forEach(
					(color) => expectOpaque(color, `${theme} independent probe`),
				);
				expect(
					sameRgb(roleProbe.rgb, theme === "dark" ? mixProbe.rgb : accent.rgb),
				).toBe(true);

				const radios = [
					...host.querySelectorAll<HTMLElement>(
						'.segmented-control [role="radio"]',
					),
				];
				expect(radios).toHaveLength(3);
				const focusedMeasurements: Array<Record<string, unknown>> = [];
				for (const [index, radio] of radios.entries()) {
					radio.focus();
					expect(document.activeElement).toBe(radio);
					expect(
						radio.matches(":focus-visible"),
						`segment ${index} is keyboard-visible focus`,
					).toBe(true);
					const before = normalStyleSnapshot(host, radio);
					const actual = canonicalPaint(getComputedStyle(radio).outlineColor);
					expect(getComputedStyle(radio).outlineStyle).toBe("solid");
					expect(getComputedStyle(radio).outlineWidth).toBe("2px");
					expect(getComputedStyle(radio).outlineOffset).toBe("2px");
					expectFocusPaint({
						theme,
						productionExpression,
						actual,
						accent,
						canvasText,
						mixProbe,
					});
					const boundaries = focusBoundaries(radio);
					const ratios = assertBoundaryRatios(
						boundaries,
						actual,
						ground,
						surface,
						theme,
						`focus segment ${index}`,
					);
					expect(
						boundaries.some((boundary) =>
							sameRgb(boundary.paint.rgb, ground.rgb),
						),
					).toBe(true);
					expect(
						boundaries.some((boundary) =>
							sameRgb(boundary.paint.rgb, surface.rgb),
						),
					).toBe(true);
					const originalOutline = radio.style.outlineColor;
					radio.style.outlineColor = "var(--ec-color-accent)";
					try {
						expect(normalStyleSnapshot(host, radio)).toEqual(before);
					} finally {
						radio.style.outlineColor = originalOutline;
					}
					expect(normalStyleSnapshot(host, radio)).toEqual(before);
					const originalOffset = radio.style.outlineOffset;
					let geometryMutationRejected = false;
					try {
						radio.style.outlineOffset = "4px";
						expect(() => {
							expect(normalStyleSnapshot(host, radio)).toEqual(before);
						}).toThrow();
						geometryMutationRejected = true;
					} finally {
						radio.style.outlineOffset = originalOffset;
					}
					expect(geometryMutationRejected).toBe(true);
					expect(normalStyleSnapshot(host, radio)).toEqual(before);
					expectFocusPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(radio).outlineColor),
						accent,
						canvasText,
						mixProbe,
					});
					focusedMeasurements.push({
						index,
						actual,
						boundaries,
						ratios,
						geometry: before,
					});
				}

				if (theme === "dark") {
					const middle = radios[1];
					if (middle === undefined) throw new Error("missing middle segment");
					middle.focus();
					expect(middle.matches(":focus-visible")).toBe(true);
					const originalColor = middle.style.outlineColor;
					try {
						middle.style.outlineColor = "var(--ec-color-accent)";
						const rawAccent = canonicalPaint(
							getComputedStyle(middle).outlineColor,
						);
						const tideBoundary = focusedMeasurements[1]?.[
							"boundaries"
						] as AdjacentPaint[];
						const tide = tideBoundary.find((boundary) =>
							sameRgb(boundary.paint.rgb, surface.rgb),
						);
						if (tide === undefined)
							throw new Error(
								"middle focus ring has no measured Tide boundary",
							);
						expect(contrastRatio(rawAccent.rgb, tide.paint.rgb)).toBeLessThan(
							3,
						);
						expect(() =>
							expectFocusPaint({
								theme,
								productionExpression,
								actual: rawAccent,
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
					} finally {
						middle.style.outlineColor = originalColor;
					}
					expectFocusPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(middle).outlineColor),
						accent,
						canvasText,
						mixProbe,
					});
					const originalToken = root.style.getPropertyValue(
						"--ec-color-platform-indicator",
					);
					try {
						root.style.setProperty(
							"--ec-color-platform-indicator",
							"color-mix(in srgb, var(--ec-color-accent) 80%, CanvasText 20%)",
						);
						const wrongWeight =
							"color-mix(in srgb, var(--ec-color-accent) 80%, CanvasText 20%)";
						expect(() =>
							expectFocusPaint({
								theme,
								productionExpression: wrongWeight,
								actual: canonicalPaint(getComputedStyle(middle).outlineColor),
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
					} finally {
						if (originalToken === "")
							root.style.removeProperty("--ec-color-platform-indicator");
						else
							root.style.setProperty(
								"--ec-color-platform-indicator",
								originalToken,
							);
					}
					expectFocusPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(middle).outlineColor),
						accent,
						canvasText,
						mixProbe,
					});
				} else {
					const middle = radios[1];
					if (middle === undefined) throw new Error("missing middle segment");
					middle.focus();
					expect(middle.matches(":focus-visible")).toBe(true);
					const originalColor = middle.style.outlineColor;
					try {
						middle.style.outlineColor = DARK_INDICATOR_EXPRESSION;
						const lightMix = canonicalPaint(
							getComputedStyle(middle).outlineColor,
						);
						expect(() =>
							expectFocusPaint({
								theme,
								productionExpression,
								actual: lightMix,
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
					} finally {
						middle.style.outlineColor = originalColor;
					}
					expectFocusPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(middle).outlineColor),
						accent,
						canvasText,
						mixProbe,
					});
				}
				for (const measurement of focusedMeasurements) {
					const index = measurement["index"] as number;
					expectFocusPaint({
						theme,
						productionExpression,
						actual: measurement["actual"] as Paint,
						accent,
						canvasText,
						mixProbe,
					});
					expect(
						(measurement["ratios"] as Record<string, number>)["left-inner"],
					).toBeGreaterThanOrEqual(3);
					expect(index).toBeGreaterThanOrEqual(0);
				}
				focusObservations.push({
					theme,
					dataTheme: root.getAttribute("data-theme"),
					colorScheme: getComputedStyle(root).colorScheme,
					forcedColors: window.matchMedia("(forced-colors: active)").matches,
					productionExpression,
					accent,
					canvasText,
					mixProbe,
					roleProbe,
					segments: focusedMeasurements,
				});
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
		focusGateComplete = focusObservations.length === THEMES.length;
		expect(focusGateComplete).toBe(true);
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		document.documentElement.style.backgroundColor = rootBg;
		document.body.style.backgroundColor = bodyBg;
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});

test("toggle-on remains raw platform accent in both themes", async () => {
	const originalTheme = window.matchMedia("(prefers-color-scheme: dark)")
		.matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "none");
			const host = await renderStory(ToggleOn, theme);
			try {
				const root = document.documentElement;
				expect(root.getAttribute("data-theme")).toBe(theme);
				expect(getComputedStyle(root).colorScheme).toBe(theme);
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(
					false,
				);
				const sourceToggle = await commands.readFile(
					"src/renderer/styles/toggle_switch.css",
				);
				expect(sourceToggle).toMatch(
					/\.toggle-switch__track--on\s*\{\s*background: var\(--ec-color-accent\);/,
				);
				const accent = colorProbe("var(--ec-color-accent)", host);
				const toggle = required<HTMLElement>(host, '[role="switch"]');
				const track = required<HTMLElement>(host, ".toggle-switch__track");
				expect(toggle.getAttribute("aria-checked")).toBe("true");
				expect(toggle.matches(":checked")).toBe(true);
				const trackBounds = rect(track);
				expect(trackBounds.width).toBe(44);
				expect(trackBounds.height).toBe(24);
				const trackPaint = canonicalPaint(
					getComputedStyle(track).backgroundColor,
				);
				expect(trackPaint.rgb).toEqual(accent.rgb);
				if (theme === "dark") {
					const priorColor = track.style.backgroundColor;
					let roleMutationRejected = false;
					try {
						track.style.backgroundColor = "var(--ec-color-platform-indicator)";
						const mutatedColor = canonicalPaint(
							getComputedStyle(track).backgroundColor,
						);
						expect(() =>
							expect(mutatedColor.rgb).toEqual(accent.rgb),
						).toThrow();
						roleMutationRejected = true;
					} finally {
						track.style.backgroundColor = priorColor;
					}
					expect(roleMutationRejected).toBe(true);
					expect(
						canonicalPaint(getComputedStyle(track).backgroundColor).rgb,
					).toEqual(accent.rgb);
				}
				expect(rect(track)).toEqual(trackBounds);
				toggleObservations.push({
					theme,
					dataTheme: root.getAttribute("data-theme"),
					colorScheme: getComputedStyle(root).colorScheme,
					forcedColors: window.matchMedia("(forced-colors: active)").matches,
					checked: toggle.getAttribute("aria-checked"),
					accent,
					track: trackPaint,
					geometry: trackBounds,
				});
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
		toggleGateComplete = toggleObservations.length === THEMES.length;
		expect(toggleGateComplete).toBe(true);
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});

test("forced-colors keeps the focused segmented control system-adjusted", async () => {
	const originalTheme = window.matchMedia("(prefers-color-scheme: dark)")
		.matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "active");
			const host = await renderStory(KeyboardFocus, theme);
			try {
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(true);
				expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
				const radio = required<HTMLElement>(
					host,
					'.segmented-control [role="radio"][aria-checked="true"]',
				);
				expect(radio.matches(":focus-visible")).toBe(true);
				const highlight = colorProbe("Highlight", host);
				const style = getComputedStyle(radio);
				expect(style.outlineStyle).toBe("solid");
				expect(style.outlineWidth).toBe("2px");
				expect(style.outlineOffset).toBe("2px");
				expect(canonicalPaint(style.outlineColor).rgb).toEqual(highlight.rgb);
				const originalOutlineColor = radio.style.outlineColor;
				try {
					radio.style.outlineColor = "var(--ec-color-accent)";
					expect(
						canonicalPaint(getComputedStyle(radio).outlineColor).rgb,
					).toEqual(highlight.rgb);
					forcedColorObservations.push({
						theme,
						kind: "segmented-focus",
						colorScheme: getComputedStyle(document.documentElement).colorScheme,
						forcedColors: window.matchMedia("(forced-colors: active)").matches,
						selector: ".segmented-control__segment:focus-visible",
						role: radio.getAttribute("role"),
						checked: radio.getAttribute("aria-checked"),
						paint: canonicalPaint(getComputedStyle(radio).outlineColor),
						platformHighlight: highlight,
						geometry: rect(radio),
					});
				} finally {
					radio.style.outlineColor = originalOutlineColor;
				}
				expect(
					canonicalPaint(getComputedStyle(radio).outlineColor).rgb,
				).toEqual(highlight.rgb);
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "none");
			}
		}
		forcedFocusComplete =
			forcedColorObservations.filter(
				(observation) => observation["kind"] === "segmented-focus",
			).length === THEMES.length;
		expect(forcedFocusComplete).toBe(true);
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});

test("forced-colors keeps the active drop border system-adjusted", async () => {
	const originalTheme = window.matchMedia("(prefers-color-scheme: dark)")
		.matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "active");
			const host = await renderStory(DropZoneDragOver, theme);
			try {
				const root = document.documentElement;
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(true);
				expect(root.getAttribute("data-theme")).toBe(theme);
				const effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)")
					.matches
					? "dark"
					: "light";
				expect(effectiveTheme).toBe(theme);
				const zone = required<HTMLElement>(host, '.drop-zone[role="region"]');
				expect(zone.classList.contains("drop-zone--active")).toBe(true);
				const before = dropSnapshot(zone);
				expect(before.borderWidths).toEqual(["2px", "2px", "2px", "2px"]);
				expect(before.borderStyles).toEqual([
					"dashed",
					"dashed",
					"dashed",
					"dashed",
				]);
				const beforePaint = canonicalPaint(
					getComputedStyle(zone).borderTopColor,
				);
				const canvasText = colorProbe("CanvasText", host);
				const systemColors = [
					["CanvasText", canvasText],
					["ButtonText", colorProbe("ButtonText", host)],
					["ButtonBorder", colorProbe("ButtonBorder", host)],
					["Highlight", colorProbe("Highlight", host)],
				] as const;
				expect(
					systemColors.some(([, sample]) =>
						sameRgb(sample.rgb, beforePaint.rgb),
					),
					"forced drop border resolves to a platform system color",
				).toBe(true);
				const priorBorderColor = zone.style.borderColor;
				try {
					zone.style.borderColor = "var(--ec-color-accent)";
					expect(
						canonicalPaint(getComputedStyle(zone).borderTopColor).rgb,
					).toEqual(beforePaint.rgb);
					expect(dropSnapshot(zone)).toEqual(before);
				} finally {
					zone.style.borderColor = priorBorderColor;
				}
				expect(
					canonicalPaint(getComputedStyle(zone).borderTopColor).rgb,
				).toEqual(beforePaint.rgb);
				forcedColorObservations.push({
					theme,
					kind: "active-drop-border",
					effectiveTheme,
					colorScheme: getComputedStyle(root).colorScheme,
					forcedColors: window.matchMedia("(forced-colors: active)").matches,
					selector: ".drop-zone--active",
					active: zone.classList.contains("drop-zone--active"),
					paint: beforePaint,
					systemColors: Object.fromEntries(systemColors),
					geometry: before,
					rawAccentPlant: { rejectedBySystemAdjustment: true, restored: true },
				});
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "none");
			}
		}
		forcedDropComplete =
			forcedColorObservations.filter(
				(observation) => observation["kind"] === "active-drop-border",
			).length === THEMES.length;
		expect(forcedDropComplete).toBe(true);
		forcedGateComplete = forcedFocusComplete && forcedDropComplete;
		expect(forcedGateComplete).toBe(true);
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});

test("real active drop borders pass both painted sides in both themes", async () => {
	expect(focusGateComplete && toggleGateComplete && forcedGateComplete).toBe(
		true,
	);
	const originalTheme = window.matchMedia("(prefers-color-scheme: dark)")
		.matches
		? "dark"
		: "light";
	const originalDataTheme = document.documentElement.getAttribute("data-theme");
	const rootBg = document.documentElement.style.backgroundColor;
	const bodyBg = document.body.style.backgroundColor;
	const sourceTokens = await commands.readFile(
		"src/renderer/styles/tokens.css",
	);
	const sourceDropZone = await commands.readFile(
		"src/renderer/styles/drop_zone.css",
	);
	expect(sourceTokens).toContain(
		"--ec-color-platform-indicator: var(--ec-color-accent);",
	);
	expect(sourceTokens).toContain(
		"--ec-color-platform-indicator: color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%);",
	);
	expect(sourceDropZone).toMatch(
		/\.drop-zone--active\s*\{\s*border: 2px dashed var\(--ec-color-platform-indicator\);\s*background-color: var\(--ec-color-surface\);\s*\}/,
	);
	try {
		for (const theme of THEMES) {
			await commands.setPaletteMedia(theme, "none");
			document.documentElement.style.backgroundColor = "var(--ec-color-bg)";
			document.body.style.backgroundColor = "var(--ec-color-bg)";
			const host = await renderStory(DropZoneDragOver, theme);
			try {
				const root = document.documentElement;
				expect(root.getAttribute("data-theme")).toBe(theme);
				expect(getComputedStyle(root).colorScheme).toBe(theme);
				expect(window.matchMedia("(forced-colors: active)").matches).toBe(
					false,
				);
				const zone = required<HTMLElement>(host, '.drop-zone[role="region"]');
				expect(zone.classList.contains("drop-zone--active")).toBe(true);
				expect(zone.getAttribute("aria-label")).toBeTruthy();
				const productionExpression =
					theme === "dark"
						? DARK_INDICATOR_EXPRESSION
						: "var(--ec-color-accent)";
				expectExactRoleExpression(productionExpression, theme);
				const accent = colorProbe("var(--ec-color-accent)", host);
				const canvasText = colorProbe("CanvasText", host);
				const mixProbe = colorProbe(DARK_INDICATOR_EXPRESSION, host);
				const roleProbe = colorProbe(
					"var(--ec-color-platform-indicator)",
					host,
				);
				const ground = surfaceRgb(root, "--ec-color-bg");
				const surface = surfaceRgb(root, "--ec-color-surface");
				[accent, canvasText, mixProbe, roleProbe, ground, surface].forEach(
					(color) => expectOpaque(color, `${theme} drop independent probe`),
				);
				expect(
					sameRgb(roleProbe.rgb, theme === "dark" ? mixProbe.rgb : accent.rgb),
				).toBe(true);

				const style = getComputedStyle(zone);
				expect(style.borderTopWidth).toBe("2px");
				expect(style.borderRightWidth).toBe("2px");
				expect(style.borderBottomWidth).toBe("2px");
				expect(style.borderLeftWidth).toBe("2px");
				expect(style.borderTopStyle).toBe("dashed");
				expect(style.borderRightStyle).toBe("dashed");
				expect(style.borderBottomStyle).toBe("dashed");
				expect(style.borderLeftStyle).toBe("dashed");
				expect(canonicalPaint(style.backgroundColor).rgb).toEqual(surface.rgb);
				const actual = canonicalPaint(style.borderTopColor);
				for (const side of [
					style.borderRightColor,
					style.borderBottomColor,
					style.borderLeftColor,
				])
					expect(canonicalPaint(side).rgb).toEqual(actual.rgb);
				expectDropPaint({
					theme,
					productionExpression,
					actual,
					accent,
					canvasText,
					mixProbe,
				});
				const before = dropSnapshot(zone);
				const boundaries = dropBoundaries(zone);
				const ratios = assertDropBoundaryRatios(
					boundaries,
					actual,
					ground,
					surface,
					theme,
				);
				const priorBorderColor = zone.style.borderColor;
				zone.style.borderColor = "var(--ec-color-accent)";
				try {
					expect(dropSnapshot(zone)).toEqual(before);
				} finally {
					zone.style.borderColor = priorBorderColor;
				}
				expect(dropSnapshot(zone)).toEqual(before);
				expectDropPaint({
					theme,
					productionExpression,
					actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
					accent,
					canvasText,
					mixProbe,
				});
				assertDropBoundaryRatios(
					dropBoundaries(zone),
					canonicalPaint(getComputedStyle(zone).borderTopColor),
					ground,
					surface,
					theme,
				);

				let omittedSideRejected = false;
				try {
					expect(() =>
						assertDropBoundaryRatios(
							boundaries.filter(
								(boundary) => boundary.position !== "left-inner",
							),
							actual,
							ground,
							surface,
							theme,
						),
					).toThrow();
					omittedSideRejected = true;
				} finally {
					assertDropBoundaryRatios(
						dropBoundaries(zone),
						canonicalPaint(getComputedStyle(zone).borderTopColor),
						ground,
						surface,
						theme,
					);
				}
				expect(omittedSideRejected).toBe(true);

				let geometryMutationRejected = false;
				const originalWidth = zone.style.borderWidth;
				try {
					zone.style.borderWidth = "4px";
					expect(() => expect(dropSnapshot(zone)).toEqual(before)).toThrow();
					geometryMutationRejected = true;
				} finally {
					zone.style.borderWidth = originalWidth;
				}
				expect(geometryMutationRejected).toBe(true);
				expect(dropSnapshot(zone)).toEqual(before);

				let surfaceMutationRejected = false;
				const originalBackground = zone.style.backgroundColor;
				try {
					zone.style.backgroundColor = "var(--ec-color-bg)";
					expect(() =>
						assertDropBoundaryRatios(
							dropBoundaries(zone),
							actual,
							ground,
							surface,
							theme,
						),
					).toThrow();
					surfaceMutationRejected = true;
				} finally {
					zone.style.backgroundColor = originalBackground;
				}
				expect(surfaceMutationRejected).toBe(true);
				expect(dropSnapshot(zone)).toEqual(before);
				assertDropBoundaryRatios(
					dropBoundaries(zone),
					canonicalPaint(getComputedStyle(zone).borderTopColor),
					ground,
					surface,
					theme,
				);

				let rawDarkAccentRejected = false;
				let wrongWeightRejected = false;
				let unrelatedRoleRejected = false;
				if (theme === "dark") {
					const tide = boundaries.find(
						(boundary) =>
							boundary.position.endsWith("-inner") &&
							sameRgb(boundary.paint.rgb, surface.rgb),
					);
					if (tide === undefined)
						throw new Error("drop border has no real inner Tide boundary");
					const priorColor = zone.style.borderColor;
					try {
						zone.style.borderColor = "var(--ec-color-accent)";
						const rawAccent = canonicalPaint(
							getComputedStyle(zone).borderTopColor,
						);
						expect(contrastRatio(rawAccent.rgb, tide.paint.rgb)).toBeLessThan(
							3,
						);
						expect(() =>
							expectDropPaint({
								theme,
								productionExpression,
								actual: rawAccent,
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
						rawDarkAccentRejected = true;
					} finally {
						zone.style.borderColor = priorColor;
					}
					expectDropPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
						accent,
						canvasText,
						mixProbe,
					});

					const priorToken = root.style.getPropertyValue(
						"--ec-color-platform-indicator",
					);
					try {
						root.style.setProperty(
							"--ec-color-platform-indicator",
							"color-mix(in srgb, var(--ec-color-accent) 80%, CanvasText 20%)",
						);
						expect(() =>
							expectDropPaint({
								theme,
								productionExpression:
									"color-mix(in srgb, var(--ec-color-accent) 80%, CanvasText 20%)",
								actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
						wrongWeightRejected = true;
					} finally {
						if (priorToken === "")
							root.style.removeProperty("--ec-color-platform-indicator");
						else
							root.style.setProperty(
								"--ec-color-platform-indicator",
								priorToken,
							);
					}
					expectDropPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
						accent,
						canvasText,
						mixProbe,
					});

					const priorRoleColor = zone.style.borderColor;
					try {
						zone.style.borderColor = "var(--ec-color-action)";
						expect(() =>
							expectDropPaint({
								theme,
								productionExpression,
								actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
								accent,
								canvasText,
								mixProbe,
							}),
						).toThrow();
						unrelatedRoleRejected = true;
					} finally {
						zone.style.borderColor = priorRoleColor;
					}
					expectDropPaint({
						theme,
						productionExpression,
						actual: canonicalPaint(getComputedStyle(zone).borderTopColor),
						accent,
						canvasText,
						mixProbe,
					});
				}
				expect(
					!theme ||
						theme !== "dark" ||
						(rawDarkAccentRejected &&
							wrongWeightRejected &&
							unrelatedRoleRejected),
				).toBe(true);
				dropObservations.push({
					theme,
					dataTheme: root.getAttribute("data-theme"),
					colorScheme: getComputedStyle(root).colorScheme,
					forcedColors: window.matchMedia("(forced-colors: active)").matches,
					selector: ".drop-zone--active",
					active: zone.classList.contains("drop-zone--active"),
					productionExpression,
					accent,
					canvasText,
					mixProbe,
					roleProbe,
					actual,
					boundaries,
					ratios,
					geometry: before,
					negativeControls: {
						rawDarkAccentRejected,
						omittedSideRejected,
						wrongWeightRejected,
						unrelatedRoleRejected,
						geometryMutationRejected,
						surfaceMutationRejected,
						restoredGreen: true,
					},
				});
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
		dropGateComplete = dropObservations.length === THEMES.length;
		expect(dropGateComplete).toBe(true);
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		document.documentElement.style.backgroundColor = rootBg;
		document.body.style.backgroundColor = bodyBg;
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});

test("writes only a complete current-source indicator proof", async () => {
	expect(focusGateComplete).toBe(true);
	expect(toggleGateComplete).toBe(true);
	expect(forcedGateComplete).toBe(true);
	expect(dropGateComplete).toBe(true);
	expect(focusObservations).toHaveLength(2);
	expect(toggleObservations).toHaveLength(2);
	expect(forcedColorObservations).toHaveLength(4);
	expect(dropObservations).toHaveLength(2);

	const sourceSnapshot = await readIndicatorSources();
	const tokenIndex = INDICATOR_SOURCE_PATHS.indexOf(
		"src/renderer/styles/tokens.css",
	);
	const pairsIndex = INDICATOR_SOURCE_PATHS.indexOf(
		"tests/renderer/contrast/contrast_pairs.json",
	);
	const tokenSource = sourceSnapshot.texts[tokenIndex];
	const pairsSource = sourceSnapshot.texts[pairsIndex];
	if (tokenSource === undefined || pairsSource === undefined)
		throw new Error("source-bound static contrast inputs are missing");
	const pairDoc = JSON.parse(pairsSource) as ContrastPairsDocument;
	expect(pairsShapeProblems(pairDoc)).toEqual([]);
	const staticResults = evaluate(pairDoc, tokenSource);
	// The source-backed English/header and pressed-state pairs add six real
	// evaluator rows to the 94-row pre-palette indicator contract.
	expect(staticResults).toHaveLength(100);
	expect(staticResults.length).toBeGreaterThan(0);
	expect(staticResults.every((result) => result.pass)).toBe(true);
	const proposed = proposedResults(pairDoc);
	expect(proposed).toHaveLength(27);
	expect(proposed.every((result) => result.pass)).toBe(true);
	const proposedCounterparts = proposed.map((candidate) => {
		const theme = candidate.id.startsWith("dark-")
			? "dark"
			: candidate.id.startsWith("light-")
				? "light"
				: null;
		expect(
			theme,
			`theme is explicit in proposed pair ${candidate.id}`,
		).not.toBeNull();
		const matches = staticResults.filter(
			(result) =>
				result.theme === theme &&
				result.role === candidate.role &&
				result.fgHex.toLowerCase() === candidate.fgHex.toLowerCase() &&
				result.bgHex.toLowerCase() === candidate.bgHex.toLowerCase() &&
				result.threshold === candidate.threshold,
		);
		expect(
			matches.length,
			`actual static counterparts for ${candidate.id}`,
		).toBeGreaterThan(0);
		expect(matches.every((result) => result.pass)).toBe(true);
		return {
			id: candidate.id,
			theme,
			role: candidate.role,
			fgHex: candidate.fgHex,
			bgHex: candidate.bgHex,
			ratio: candidate.ratio,
			threshold: candidate.threshold,
			fingerprints: matches.map((result) => result.fingerprint),
		};
	});

	const record = {
		schemaVersion: 1,
		createdAt: new Date().toISOString(),
		browser: { userAgent: navigator.userAgent, platform: navigator.platform },
		sourceProof: { algorithm: "SHA-256", inputs: sourceSnapshot.inputs },
		sourceDigests: sourceSnapshot.digests,
		gates: {
			focus: focusObservations,
			toggleOn: toggleObservations,
			forcedColors: forcedColorObservations,
			drop: dropObservations,
		},
		staticContrast: {
			count: staticResults.length,
			passing: staticResults.filter((result) => result.pass).length,
			unresolved: staticResults.filter((result) => !result.pass).length,
			results: staticResults.map((result) => ({
				pair: result.pair,
				backdrop: result.backdrop,
				theme: result.theme,
				role: result.role,
				fgHex: result.fgHex,
				bgHex: result.bgHex,
				ratio: result.ratio,
				threshold: result.threshold,
				pass: result.pass,
				fingerprint: result.fingerprint,
			})),
			proposedCount: proposed.length,
			proposedPassing: proposed.filter((result) => result.pass).length,
			proposedCounterparts,
		},
		negativeControls: {
			focusRawDarkAccentOnTideRejected: true,
			focusWrongMixWeightRejected: true,
			focusLightMixRejected: true,
			toggleOnRoleMutationRejected: true,
			focusGeometryMutationRejected: true,
			dropRawDarkAccentOnTideRejected: true,
			dropOmittedBoundaryRejected: true,
			dropWrongMixWeightRejected: true,
			dropUnrelatedRoleRejected: true,
			dropGeometryMutationRejected: true,
			dropSurfaceMutationRejected: true,
			sourceDigestMutationRejected: true,
			missingSourceRejected: true,
			duplicateSourceRejected: true,
			allVisualPlantsRestored: true,
		},
		separateOffTrackEvidence: {
			record: "node_modules/.cache/palette77-platform.json",
			rolesMerged: false,
			mutated: false,
		},
	};
	assertSourceProofMatchesCurrent(record, sourceSnapshot.digests);

	const stale = structuredClone(record);
	const staleInput = stale.sourceProof.inputs[0];
	if (staleInput === undefined)
		throw new Error("first source digest is missing");
	const wrongDigest = `${staleInput.sha256.startsWith("0") ? "1" : "0"}${staleInput.sha256.slice(1)}`;
	stale.sourceProof.inputs[0] = { ...staleInput, sha256: wrongDigest };
	stale.sourceDigests[staleInput.path] = wrongDigest;
	expect(() =>
		assertSourceProofMatchesCurrent(stale, sourceSnapshot.digests),
	).toThrow();
	const missing = structuredClone(record);
	const removed = missing.sourceProof.inputs.pop();
	if (removed === undefined) throw new Error("source digest cannot be removed");
	delete missing.sourceDigests[removed.path];
	expect(() =>
		assertSourceProofMatchesCurrent(missing, sourceSnapshot.digests),
	).toThrow();
	const duplicate = structuredClone(record);
	const first = duplicate.sourceProof.inputs[0];
	if (first === undefined) throw new Error("first source digest is missing");
	const second = duplicate.sourceProof.inputs[1];
	if (second === undefined) throw new Error("second source digest is missing");
	duplicate.sourceProof.inputs[1] = {
		...second,
		path: first.path,
	};
	expect(() =>
		assertSourceProofMatchesCurrent(duplicate, sourceSnapshot.digests),
	).toThrow();

	const evidencePath = "node_modules/.cache/palette77-indicators.json";
	await commands.writeFile(evidencePath, JSON.stringify(record, null, 2));
	const written = JSON.parse(
		await commands.readFile(evidencePath),
	) as typeof record;
	assertSourceProofBindings(written);
	const independentlyRead = await readIndicatorSources();
	assertSourceProofMatchesCurrent(written, independentlyRead.digests);
	expect(written.sourceProof.inputs).toEqual(independentlyRead.inputs);
});
