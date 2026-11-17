import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import { commands } from "vitest/browser";
import { contrastRatio } from "../tests/renderer/contrast/wcag.mjs";
import * as segmentedStories from "../src/renderer/components/settings/SegmentedControl.stories";
import * as toggleStories from "../src/renderer/components/settings/ToggleSwitch.stories";
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
const THEMES: PaletteTheme[] = ["light", "dark"];
const DARK_INDICATOR_EXPRESSION =
	"color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%)";

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
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
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
				expect(
					canonicalPaint(getComputedStyle(track).backgroundColor).rgb,
				).toEqual(accent.rgb);
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
			} finally {
				host.remove();
				await commands.setPaletteMedia(theme, "active");
			}
		}
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
	} finally {
		await commands.setPaletteMedia(originalTheme, "active");
		if (originalDataTheme === null)
			document.documentElement.removeAttribute("data-theme");
		else document.documentElement.setAttribute("data-theme", originalDataTheme);
	}
});
