// WCAG 2.2 colour maths for the static contrast test (Phase 74, SPEC-02, D-23).
//
// Formulas: WCAG 2.2 glossary "relative luminance" (the 0.04045 threshold of the
// sRGB transfer function; the pre-2021 text said 0.03928) and "contrast ratio"
// `(L1 + 0.05) / (L2 + 0.05)`. axe-core 4.14.0 reports a ratio truncated to two
// decimals (`Math.floor(textContrast * 100) / 100`), so `floor2` is the unit every
// quoted ratio uses. Translucent colours are flattened bottom-up in the
// gamma-encoded sRGB the stylesheets are authored in, one `Math.round` per channel,
// which reproduces the backgrounds axe measures (removed-bg over the light surface
// is #eadee1). No colour library: the oracle in contrast.test.ts pins this copy to
// axe's recorded triples and to the BRAND.md ratios.

const KEYWORDS = Object.freeze({
	white: { r: 255, g: 255, b: 255, a: 1 },
	black: { r: 0, g: 0, b: 0, a: 1 },
	transparent: { r: 0, g: 0, b: 0, a: 0 },
});

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;

/**
 * @param {string} text
 * @returns {number | null} a channel 0-255, or null
 */
function channel(text) {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const percent = trimmed.endsWith("%");
	const value = Number(percent ? trimmed.slice(0, -1) : trimmed);
	if (!Number.isFinite(value)) return null;
	const scaled = percent ? (value / 100) * 255 : value;
	return Math.min(255, Math.max(0, Math.round(scaled)));
}

/**
 * @param {string} text
 * @returns {number | null} an alpha 0-1, or null
 */
function alpha(text) {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const percent = trimmed.endsWith("%");
	const value = Number(percent ? trimmed.slice(0, -1) : trimmed);
	if (!Number.isFinite(value)) return null;
	return Math.min(1, Math.max(0, percent ? value / 100 : value));
}

/**
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` with comma or
 * space syntax, and the keywords `white`, `black` and `transparent`.
 *
 * @param {string} text
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseColour(text) {
	if (typeof text !== "string") return null;
	const source = text.trim().toLowerCase();
	if (Object.hasOwn(KEYWORDS, source)) {
		return { ...KEYWORDS[/** @type {keyof typeof KEYWORDS} */ (source)] };
	}
	const hex = HEX.exec(source);
	if (hex !== null) {
		let digits = hex[1] ?? "";
		if (digits.length <= 4) {
			digits = [...digits].map((digit) => digit + digit).join("");
		}
		const byte = (index) => parseInt(digits.slice(index, index + 2), 16);
		return {
			r: byte(0),
			g: byte(2),
			b: byte(4),
			a: digits.length === 8 ? byte(6) / 255 : 1,
		};
	}
	const call = /^rgba?\(\s*([^)]*)\)$/.exec(source);
	if (call === null) return null;
	const body = call[1] ?? "";
	const parts = body.includes(",")
		? body.split(",")
		: body.replace("/", " ").split(/\s+/).filter(Boolean);
	if (parts.length !== 3 && parts.length !== 4) return null;
	const r = channel(parts[0] ?? "");
	const g = channel(parts[1] ?? "");
	const b = channel(parts[2] ?? "");
	const a = parts.length === 4 ? alpha(parts[3] ?? "") : 1;
	if (r === null || g === null || b === null || a === null) return null;
	return { r, g, b, a };
}

/**
 * The colour `top` paints over the opaque `under`, per channel
 * `Math.round(top * a + under * (1 - a))` in gamma-encoded sRGB; alpha 1.
 *
 * @param {{ r: number, g: number, b: number, a: number }} top
 * @param {{ r: number, g: number, b: number }} under
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function flatten(top, under) {
	const mix = (over, below) => Math.round(over * top.a + below * (1 - top.a));
	return {
		r: mix(top.r, under.r),
		g: mix(top.g, under.g),
		b: mix(top.b, under.b),
		a: 1,
	};
}

/**
 * @param {number} value a channel 0-255
 * @returns {number}
 */
function linear(value) {
	const unit = value / 255;
	return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {{ r: number, g: number, b: number }} colour
 * @returns {number}
 */
export function relativeLuminance({ r, g, b }) {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * @param {{ r: number, g: number, b: number }} first
 * @param {{ r: number, g: number, b: number }} second
 * @returns {number} the unrounded ratio, 1 to 21
 */
export function contrastRatio(first, second) {
	const a = relativeLuminance(first);
	const b = relativeLuminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Truncates to two decimals the way axe does; the epsilon absorbs the binary
 * error of a product such as 4.35 * 100.
 *
 * @param {number} value
 * @returns {number}
 */
export function floor2(value) {
	return Math.floor(value * 100 + 1e-9) / 100;
}

/**
 * @param {number} value
 * @returns {string} the floored ratio with two decimals, e.g. "4.32"
 */
export function formatRatio(value) {
	return floor2(value).toFixed(2);
}

/**
 * @param {{ r: number, g: number, b: number }} colour
 * @returns {string} lower-case `#rrggbb`
 */
export function toHex({ r, g, b }) {
	return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
