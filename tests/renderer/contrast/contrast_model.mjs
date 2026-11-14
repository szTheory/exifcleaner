// The static contrast evaluator (Phase 74, SPEC-02, D-21 to D-24).
//
// Pure over two documents: the declared pairs (contrast_pairs.json) and the text of
// src/renderer/styles/tokens.css. Nothing here reads the disk, so a test plants a
// defect as a string or a cloned document. A pair names a foreground and the
// backdrops it is painted on; `evaluate` returns one result per pair x backdrop x
// theme, each with the unrounded WCAG ratio and the register fingerprint the
// baseline carries.
import { customPropertyDeclarations } from "../../../.storybook/catalog/css_scan.mjs";
import {
	contrastRatio,
	flatten,
	formatRatio,
	parseColour,
	toHex,
} from "./wcag.mjs";

export const THEMES = Object.freeze(["light", "dark"]);

// SC 1.4.3 (text), SC 1.4.11 (non-text contrast and the focus indicator). There
// is no `large` role: nothing in the app is 24 px and weight 600 is not bold.
export const THRESHOLDS = Object.freeze({
	text: 4.5,
	"non-text": 3,
	focus: 3,
});

const LIGHT_BLOCK = ":root";
const DARK_BLOCK = '[data-theme="dark"]';
const ALIAS_DEPTH = 16;

const VAR_CALL = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([\s\S]*))?\)$/;

/**
 * @param {string} first
 * @param {string} second
 * @returns {number}
 */
export function compareCodeUnits(first, second) {
	if (first < second) return -1;
	if (first > second) return 1;
	return 0;
}

/**
 * The raw values of every custom property of tokens.css, per theme: `:root` is the
 * light theme and the dark theme is the dark block laid over it.
 *
 * @param {string} tokensCss
 * @returns {{ light: Map<string, string>, dark: Map<string, string> }}
 */
export function themeTokens(tokensCss) {
	/** @type {Map<string, string>} */
	const light = new Map();
	/** @type {Map<string, string>} */
	const overrides = new Map();
	for (const found of customPropertyDeclarations(tokensCss)) {
		const block = found.selectors.join(" ");
		if (block === LIGHT_BLOCK) light.set(found.property, found.value);
		else if (block === DARK_BLOCK) overrides.set(found.property, found.value);
	}
	return { light, dark: new Map([...light, ...overrides]) };
}

/**
 * @param {string} name
 * @param {"light" | "dark"} theme
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {{ localTokens?: Record<string, { light: string, dark: string }> }} doc
 * @returns {string | undefined}
 */
function rawValue(name, theme, tokens, doc) {
	const declared = tokens[theme].get(name);
	if (declared !== undefined) return declared;
	const local = doc.localTokens?.[name];
	return local === undefined ? undefined : local[theme];
}

/**
 * @param {string} text a token name, a `var()` call or a colour literal
 * @param {"light" | "dark"} theme
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {{ localTokens?: Record<string, { light: string, dark: string }> }} doc
 * @param {number} depth
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function resolveText(text, theme, tokens, doc, depth) {
	if (depth > ALIAS_DEPTH) return null;
	const source = text.trim();
	if (source.startsWith("--")) {
		const raw = rawValue(source, theme, tokens, doc);
		return raw === undefined
			? null
			: resolveText(raw, theme, tokens, doc, depth + 1);
	}
	const call = VAR_CALL.exec(source);
	if (call !== null) {
		const raw = rawValue(call[1] ?? "", theme, tokens, doc);
		if (raw !== undefined)
			return resolveText(raw, theme, tokens, doc, depth + 1);
		return call[2] === undefined
			? null
			: resolveText(call[2], theme, tokens, doc, depth + 1);
	}
	return parseColour(source);
}

/**
 * Follows `var(--x)` chains (aliases, and a `var()` fallback when the name is
 * declared nowhere), the document's `localTokens`, and parses a literal.
 *
 * @param {string} ref a token name, a `var()` call or a colour literal
 * @param {"light" | "dark"} theme
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {{ localTokens?: Record<string, { light: string, dark: string }> }} doc
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function resolveColour(ref, theme, tokens, doc) {
	return resolveText(ref, theme, tokens, doc, 0);
}

/**
 * @param {string} ref
 * @param {{ overlays?: Array<{ id: string, layers: string[] }> }} doc
 * @returns {{ id: string, layers: string[] } | undefined}
 */
function overlayOf(ref, doc) {
	return (doc.overlays ?? []).find((overlay) => overlay.id === ref);
}

/**
 * The short name of a backdrop in a rule slug: an overlay id as written, a token
 * without its `--ec-color-` or `--` prefix, a literal as `hex-` plus its lower-case
 * hex without `#`.
 *
 * @param {string} ref
 * @param {{ overlays?: Array<{ id: string, layers: string[] }> }} doc
 * @returns {string}
 */
export function backdropShortName(ref, doc) {
	if (overlayOf(ref, doc) !== undefined) return ref;
	if (ref.startsWith("--ec-color-")) return ref.slice("--ec-color-".length);
	if (ref.startsWith("--")) return ref.slice(2);
	return `hex-${ref.replace(/^#/, "").toLowerCase()}`;
}

/**
 * @param {{ on: string | string[] }} pair
 * @param {{ surfaces: string[], overlays?: Array<{ id: string, layers: string[] }> }} doc
 * @returns {Array<{ ref: string, short: string }>} the backdrops a pair is measured on: `on: "surfaces"` is the document's surfaces, an array lists refs (tokens, overlay ids, declared hex literals), and the word `surfaces` inside an array stands for the document's surfaces
 */
export function backdrops(pair, doc) {
	const listed = typeof pair.on === "string" ? [pair.on] : pair.on;
	const refs = listed.flatMap((ref) =>
		ref === "surfaces" ? doc.surfaces : [ref],
	);
	return [...new Set(refs)].map((ref) => ({
		ref,
		short: backdropShortName(ref, doc),
	}));
}

/**
 * @param {string} ref a token, an overlay id or a literal
 * @param {"light" | "dark"} theme
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {object} doc
 * @returns {{ r: number, g: number, b: number, a: number }} an opaque colour
 */
function resolveBackdrop(ref, theme, tokens, doc) {
	const overlay = overlayOf(ref, doc);
	const layers = overlay === undefined ? [ref] : overlay.layers;
	/** @type {{ r: number, g: number, b: number, a: number } | null} */
	let current = null;
	for (const layer of layers) {
		const colour = resolveColour(layer, theme, tokens, doc);
		if (colour === null) {
			throw new Error(
				`backdrop ${ref}: layer ${layer} is not a colour in the ${theme} theme`,
			);
		}
		if (current === null) {
			if (colour.a !== 1) {
				throw new Error(
					`backdrop ${ref}: the bottom layer ${layer} is translucent in the ${theme} theme`,
				);
			}
			current = colour;
		} else {
			current = flatten(colour, current);
		}
	}
	if (current === null) throw new Error(`backdrop ${ref} has no layer`);
	return current;
}

/**
 * One result per pair x backdrop x theme, in document order (a pair's backdrops in
 * their listed order, light before dark). An overlay's layers are flattened
 * bottom-up, and a translucent foreground is flattened over its backdrop.
 *
 * @param {{ surfaces: string[], pairs: Array<{ id: string, fg: string, on: string | string[], role: "text" | "non-text" | "focus", selector: string, story: string }>, overlays?: Array<{ id: string, layers: string[] }>, localTokens?: Record<string, { light: string, dark: string }> }} doc
 * @param {string} tokensCss
 * @returns {Array<{ pair: string, backdrop: string, theme: "light" | "dark", role: "text" | "non-text" | "focus", story: string, selector: string, fgRef: string, bgRef: string, fgHex: string, bgHex: string, ratio: number, threshold: number, pass: boolean, rule: string, fingerprint: string }>}
 */
export function evaluate(doc, tokensCss) {
	const tokens = themeTokens(tokensCss);
	const results = [];
	for (const pair of doc.pairs) {
		for (const backdrop of backdrops(pair, doc)) {
			for (const theme of THEMES) {
				const background = resolveBackdrop(backdrop.ref, theme, tokens, doc);
				const foreground = resolveColour(pair.fg, theme, tokens, doc);
				if (foreground === null) {
					throw new Error(
						`pair ${pair.id}: ${pair.fg} is not a colour in the ${theme} theme`,
					);
				}
				const painted =
					foreground.a === 1 ? foreground : flatten(foreground, background);
				const ratio = contrastRatio(painted, background);
				const threshold = THRESHOLDS[pair.role];
				const rule = `${pair.id}-on-${backdrop.short}-${theme}`;
				results.push({
					pair: pair.id,
					backdrop: backdrop.short,
					theme,
					role: pair.role,
					story: pair.story,
					selector: pair.selector,
					fgRef: pair.fg,
					bgRef: backdrop.ref,
					fgHex: toHex(painted),
					bgHex: toHex(background),
					ratio,
					threshold,
					pass: ratio >= threshold,
					rule,
					fingerprint: `contrast-gap|${pair.story}|${rule}`,
				});
			}
		}
	}
	return results;
}

/**
 * @param {Array<{ pass: boolean, fingerprint: string }>} results
 * @returns {Set<string>} the fingerprints of the evaluations that miss their threshold
 */
export function failingFingerprints(results) {
	return new Set(
		results
			.filter((result) => !result.pass)
			.map((result) => result.fingerprint),
	);
}

/**
 * The two-way comparison of D-24: a failure the baseline does not list is a new
 * failure, and a listed `contrast-gap` entry that now passes (or whose pair is
 * gone) is a fixed entry that must be removed, which is the shrink. Only
 * `contrast-gap` entries count.
 *
 * @param {Iterable<string>} failing
 * @param {Array<{ kind: string, fingerprint: string }>} entries
 * @returns {{ newFailures: string[], fixedStillListed: string[] }}
 */
export function compareBaseline(failing, entries) {
	const now = new Set(failing);
	const listed = new Set(
		entries
			.filter((entry) => entry.kind === "contrast-gap")
			.map((entry) => entry.fingerprint),
	);
	return {
		newFailures: [...now]
			.filter((value) => !listed.has(value))
			.sort(compareCodeUnits),
		fixedStillListed: [...listed]
			.filter((value) => !now.has(value))
			.sort(compareCodeUnits),
	};
}

/**
 * @param {string} ref
 * @returns {string} how a ref reads in a sentence: a token as written, a literal as `the literal <value>`, an overlay id as `overlay <id>`
 */
function describeRef(ref) {
	if (ref.startsWith("--")) return ref;
	return parseColour(ref) === null ? `overlay ${ref}` : `the literal ${ref}`;
}

/**
 * The canonical reason sentence of a `contrast-gap` entry. The ratio is floored to
 * two decimals (D-23), and the test quotes it back against the measured one.
 *
 * @param {{ selector: string, fgRef: string, bgRef: string, fgHex: string, bgHex: string, ratio: number, theme: string, role: string, threshold: number }} result
 * @returns {string}
 */
export function reasonFor(result) {
	return `Selector ${result.selector}: ${describeRef(result.fgRef)} ${result.fgHex} on ${describeRef(result.bgRef)} ${result.bgHex} measures ${formatRatio(result.ratio)}:1 in the ${result.theme} theme (${result.role}, needs ${result.threshold}:1); v5.1 fixes it against the UI-SPEC palette.`;
}

/**
 * The register entry of a failing result, keys in the baseline's order.
 *
 * @param {Parameters<typeof reasonFor>[0] & { story: string, rule: string, fingerprint: string }} result
 * @returns {{ fingerprint: string, kind: "contrast-gap", story: string, rule: string, reason: string, disposition: "fix-v5.1", severity: "major" }}
 */
export function contrastGapEntry(result) {
	return {
		fingerprint: result.fingerprint,
		kind: "contrast-gap",
		story: result.story,
		rule: result.rule,
		reason: reasonFor(result),
		disposition: "fix-v5.1",
		severity: "major",
	};
}
