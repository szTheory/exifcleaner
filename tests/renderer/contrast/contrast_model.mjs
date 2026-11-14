// The static contrast evaluator (Phase 74, SPEC-02, D-21 to D-24).
//
// Pure over two documents: the declared pairs (contrast_pairs.json) and the text of
// src/renderer/styles/tokens.css. Nothing here reads the disk, so a test plants a
// defect as a string or a cloned document. A pair names a foreground and the
// backdrops it is painted on; `evaluate` returns one result per pair x backdrop x
// theme, each with the unrounded WCAG ratio and the register fingerprint the
// baseline carries.
import {
	cssDeclarations,
	customPropertyDeclarations,
} from "../../../.storybook/catalog/css_scan.mjs";
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

// ---------------------------------------------------------------------------
// Colour literals and var() calls in a declaration value
//
// One pass over the text, no nested quantifiers (T-74-14): a literal is found
// with a sticky pattern at the current index, a parenthesis is matched with a
// stack computed once, and a fallback is looked at only up to FALLBACK_LIMIT
// characters.
// ---------------------------------------------------------------------------

const IDENT_CHAR = /[A-Za-z0-9_-]/;
const HEX_AT =
	/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9A-Za-z_-])/y;
const KEYWORD_AT = /(?:white|black|transparent)(?![A-Za-z0-9_-])/iy;
const RGB_AT = /rgba?\(/iy;
const FALLBACK_LIMIT = 1024;
const REFERENCE_LIMIT = 1000;
const FORBIDDEN_FUNCTION = /(?:color-mix|light-dark)\(/i;
const PURE_VAR = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/;

/**
 * Whitespace- and case-normalised: `RGBA( 0,0 ,0, 0.04 )` is `rgba(0, 0, 0, 0.04)`.
 * Nothing else changes, so `#fff` and `#ffffff` stay two literals.
 *
 * @param {string} text
 * @returns {string}
 */
export function normaliseLiteral(text) {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/\( /g, "(")
		.replace(/ \)/g, ")")
		.replace(/ ?, ?/g, ", ");
}

/**
 * @param {string} text
 * @returns {Map<number, number>} the index of each `(` that closes, to the index of its `)`
 */
function parenMatches(text) {
	/** @type {Map<number, number>} */
	const matches = new Map();
	/** @type {number[]} */
	const stack = [];
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === "(") stack.push(index);
		else if (char === ")") {
			const open = stack.pop();
			if (open !== undefined) matches.set(open, index);
		}
	}
	return matches;
}

/**
 * Every colour literal of a declaration value: a hex, an `rgb(` or `rgba(` call
 * (parentheses matched, so `rgba(0, 0, 0, var(--x))` is one literal) and the
 * keywords `white`, `black` and `transparent`. A keyword inside a name
 * (`--ec-color-white`) is not a literal; `inherit`, `currentColor` and `none` are
 * not colours.
 *
 * @param {string} value
 * @returns {Array<{ text: string, normalised: string }>}
 */
export function colourLiterals(value) {
	const matches = parenMatches(value);
	/** @type {Array<{ text: string, normalised: string }>} */
	const found = [];
	let index = 0;
	while (index < value.length) {
		const char = value[index] ?? "";
		const previous = index === 0 ? "" : (value[index - 1] ?? "");
		const boundary = previous === "" || !IDENT_CHAR.test(previous);
		let length = 0;
		if (char === "#") {
			HEX_AT.lastIndex = index;
			length = HEX_AT.exec(value)?.[0].length ?? 0;
		} else if (boundary && (char === "r" || char === "R")) {
			RGB_AT.lastIndex = index;
			const call = RGB_AT.exec(value);
			if (call !== null) {
				const close = matches.get(index + call[0].length - 1);
				length = (close === undefined ? value.length : close + 1) - index;
			}
		} else if (boundary && /[wWbBtT]/.test(char)) {
			KEYWORD_AT.lastIndex = index;
			length = KEYWORD_AT.exec(value)?.[0].length ?? 0;
		}
		if (length > 0) {
			const text = value.slice(index, index + length);
			found.push({ text, normalised: normaliseLiteral(text) });
			index += length;
		} else {
			index += 1;
		}
	}
	return found;
}

/**
 * Every `var(--name)` or `var(--name, fallback)` of a declaration value, nested
 * calls included. The fallback is the text after the first top-level comma.
 *
 * @param {string} value
 * @returns {Array<{ name: string, fallback: string | undefined }>}
 */
export function varReferences(value) {
	const matches = parenMatches(value);
	/** @type {Array<{ name: string, fallback: string | undefined }>} */
	const found = [];
	let index = value.indexOf("var(");
	while (index !== -1 && found.length < REFERENCE_LIMIT) {
		const previous = index === 0 ? "" : (value[index - 1] ?? "");
		if (previous === "" || !IDENT_CHAR.test(previous)) {
			const close = matches.get(index + 3);
			const end = Math.min(
				close === undefined ? value.length : close,
				index + 4 + FALLBACK_LIMIT,
			);
			const inner = value.slice(index + 4, end);
			let depth = 0;
			let comma = -1;
			for (let at = 0; at < inner.length && comma === -1; at += 1) {
				const char = inner[at];
				if (char === "(") depth += 1;
				else if (char === ")") depth -= 1;
				else if (char === "," && depth === 0) comma = at;
			}
			const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
			if (/^--[A-Za-z0-9_-]+$/.test(name)) {
				found.push({
					name,
					fallback: comma === -1 ? undefined : inner.slice(comma + 1).trim(),
				});
			}
		}
		index = value.indexOf("var(", index + 4);
	}
	return found;
}

// ---------------------------------------------------------------------------
// The closed shape of contrast_pairs.json
// ---------------------------------------------------------------------------

/**
 * @typedef {{ code: string, message: string, file?: string, line?: number }} ContrastProblem
 */

const TOP_LEVEL_KEYS = Object.freeze([
	"schemaVersion",
	"brandPin",
	"surfaces",
	"overlays",
	"localTokens",
	"pairs",
	"literals",
	"exempt",
	"proposed",
	"brandRatios",
]);
const PAIR_KEYS = Object.freeze([
	"id",
	"fg",
	"on",
	"role",
	"selector",
	"story",
]);
const ROLE_NAMES = Object.freeze(Object.keys(THRESHOLDS));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Only these two exempt tokens are painted as non-text fills (the language
// dropdown separator and the settings drawer scrim), so only they carry a `fill`.
const FILL_NAMES = Object.freeze([
	"--ec-backdrop-opacity",
	"--ec-color-border",
]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isText(value) {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {Record<string, unknown>} object
 * @param {readonly string[]} required
 * @param {readonly string[]} optional
 * @returns {string[]} one message per missing or unknown key
 */
function keyProblems(object, required, optional = []) {
	const messages = [];
	for (const key of required) {
		if (!Object.hasOwn(object, key)) messages.push(`missing key ${key}`);
	}
	for (const key of Object.keys(object)) {
		if (!required.includes(key) && !optional.includes(key)) {
			messages.push(`unknown key ${key}`);
		}
	}
	return messages;
}

/**
 * The shape of the pairs document: closed keys at every level, kebab ids, known
 * roles, literals and exemptions in their one form. Every problem is `pairs-shape`.
 *
 * @param {unknown} doc
 * @returns {ContrastProblem[]}
 */
export function pairsShapeProblems(doc) {
	/** @type {ContrastProblem[]} */
	const problems = [];
	const add = (message) => problems.push({ code: "pairs-shape", message });
	if (!isRecord(doc)) {
		add("contrast_pairs.json is not an object");
		return problems;
	}
	for (const message of keyProblems(doc, TOP_LEVEL_KEYS))
		add(`top level: ${message}`);
	if (doc["schemaVersion"] !== 1) add("schemaVersion is not 1");
	if (
		typeof doc["brandPin"] !== "string" ||
		!/^[0-9a-f]{40}$/.test(doc["brandPin"])
	) {
		add("brandPin is not a 40-digit commit");
	}

	const list = (key) => (Array.isArray(doc[key]) ? doc[key] : null);
	for (const key of [
		"surfaces",
		"overlays",
		"pairs",
		"literals",
		"exempt",
		"proposed",
		"brandRatios",
	]) {
		if (Object.hasOwn(doc, key) && list(key) === null)
			add(`${key} is not an array`);
	}
	if (!isRecord(doc["localTokens"]) && Object.hasOwn(doc, "localTokens")) {
		add("localTokens is not an object");
	}

	const overlayIds = new Set();
	for (const [index, overlay] of (list("overlays") ?? []).entries()) {
		if (!isRecord(overlay)) {
			add(`overlays[${index}] is not an object`);
			continue;
		}
		for (const message of keyProblems(overlay, ["id", "layers"])) {
			add(`overlays[${index}]: ${message}`);
		}
		const id = overlay["id"];
		if (Object.hasOwn(overlay, "id")) {
			if (typeof id !== "string" || !SLUG.test(id))
				add(`overlays[${index}]: id is not a kebab slug`);
			else if (overlayIds.has(id))
				add(`overlays[${index}]: duplicate id ${id}`);
			else overlayIds.add(id);
		}
		const layers = overlay["layers"];
		if (
			Object.hasOwn(overlay, "layers") &&
			(!Array.isArray(layers) || layers.length === 0 || !layers.every(isText))
		) {
			add(`overlays[${index}]: layers is not a non-empty list of strings`);
		}
	}

	for (const [index, ref] of (list("surfaces") ?? []).entries()) {
		if (!isText(ref)) add(`surfaces[${index}] is not a non-empty string`);
		else if (!ref.startsWith("--") && !overlayIds.has(ref)) {
			add(`surfaces[${index}]: ${ref} is neither a token nor an overlay id`);
		}
	}

	if (isRecord(doc["localTokens"])) {
		for (const [name, value] of Object.entries(doc["localTokens"])) {
			if (!name.startsWith("--"))
				add(`localTokens: ${name} is not a custom property name`);
			else if (
				!isRecord(value) ||
				keyProblems(value, ["light", "dark"]).length > 0 ||
				parseColour(String(value["light"])) === null ||
				parseColour(String(value["dark"])) === null
			) {
				add(`localTokens: ${name} is not { light, dark } colours`);
			}
		}
	}

	const pairIds = new Set();
	for (const [index, pair] of (list("pairs") ?? []).entries()) {
		if (!isRecord(pair)) {
			add(`pairs[${index}] is not an object`);
			continue;
		}
		const where = `pairs[${index}] ${String(pair["id"])}`;
		for (const message of keyProblems(pair, PAIR_KEYS))
			add(`${where}: ${message}`);
		if (Object.hasOwn(pair, "id")) {
			const id = pair["id"];
			if (typeof id !== "string" || !SLUG.test(id) || id.startsWith("a11y")) {
				add(`${where}: id is not a kebab slug outside the a11y namespace`);
			} else if (pairIds.has(id)) add(`${where}: duplicate pair id`);
			else pairIds.add(id);
		}
		for (const key of ["selector", "story"]) {
			if (Object.hasOwn(pair, key) && !isText(pair[key])) {
				add(`${where}: ${key} is not a non-empty string`);
			}
		}
		if (
			Object.hasOwn(pair, "role") &&
			!ROLE_NAMES.includes(String(pair["role"]))
		) {
			add(
				`${where}: role ${String(pair["role"])} is not one of ${ROLE_NAMES.join(", ")}`,
			);
		}
		if (Object.hasOwn(pair, "fg")) {
			const fg = pair["fg"];
			if (!isText(fg) || (!fg.startsWith("--") && parseColour(fg) === null)) {
				add(`${where}: fg is neither a token nor a colour literal`);
			}
		}
		if (Object.hasOwn(pair, "on")) {
			const on = pair["on"];
			const refs = typeof on === "string" ? [on] : on;
			if (
				on !== "surfaces" &&
				(!Array.isArray(refs) || refs.length === 0 || !refs.every(isText))
			) {
				add(
					`${where}: on is neither "surfaces" nor a non-empty list of backdrops`,
				);
			} else if (Array.isArray(refs)) {
				for (const ref of refs) {
					const allowed =
						ref === "surfaces" ||
						ref.startsWith("--") ||
						overlayIds.has(ref) ||
						/^#[0-9a-fA-F]{6}$/.test(ref);
					if (!allowed)
						add(
							`${where}: backdrop ${ref} is no token, overlay id or hex literal`,
						);
				}
			}
		}
	}

	const literalValues = new Set();
	for (const [index, literal] of (list("literals") ?? []).entries()) {
		if (!isRecord(literal)) {
			add(`literals[${index}] is not an object`);
			continue;
		}
		const where = `literals[${index}] ${String(literal["value"])}`;
		const hasPair = Object.hasOwn(literal, "pair");
		const hasExempt = Object.hasOwn(literal, "exempt");
		for (const message of keyProblems(
			literal,
			["value", "files"],
			["pair", "exempt"],
		)) {
			add(`${where}: ${message}`);
		}
		if (hasPair === hasExempt)
			add(`${where}: needs exactly one of pair and exempt`);
		if (Object.hasOwn(literal, "value")) {
			const value = literal["value"];
			if (typeof value !== "string" || value !== normaliseLiteral(value)) {
				add(`${where}: value is not in its normalised form`);
			} else if (literalValues.has(value)) add(`${where}: duplicate literal`);
			else literalValues.add(value);
		}
		const files = literal["files"];
		if (
			Object.hasOwn(literal, "files") &&
			(!Array.isArray(files) ||
				files.length === 0 ||
				!files.every((f) => isText(f) && f.endsWith(".css")))
		) {
			add(`${where}: files is not a non-empty list of .css names`);
		}
		if (hasPair && !pairIds.has(String(literal["pair"]))) {
			add(`${where}: pair ${String(literal["pair"])} is not a pair id`);
		}
		if (hasExempt && !isText(literal["exempt"]))
			add(`${where}: exempt is not a reason`);
	}

	const exemptNames = new Set();
	for (const [index, entry] of (list("exempt") ?? []).entries()) {
		if (!isRecord(entry)) {
			add(`exempt[${index}] is not an object`);
			continue;
		}
		const where = `exempt[${index}] ${String(entry["name"])}`;
		for (const message of keyProblems(entry, ["name", "reason"], ["fill"])) {
			add(`${where}: ${message}`);
		}
		if (Object.hasOwn(entry, "name")) {
			const name = entry["name"];
			if (typeof name !== "string" || !name.startsWith("--"))
				add(`${where}: name is not a custom property`);
			else if (exemptNames.has(name)) add(`${where}: duplicate exemption`);
			else exemptNames.add(name);
		}
		if (Object.hasOwn(entry, "reason") && !isText(entry["reason"]))
			add(`${where}: reason is empty`);
		if (Object.hasOwn(entry, "fill")) {
			if (!isText(entry["fill"])) add(`${where}: fill is empty`);
			else if (!FILL_NAMES.includes(String(entry["name"]))) {
				add(
					`${where}: only ${FILL_NAMES.join(" and ")} may carry a fill reason`,
				);
			}
		}
	}

	/** @type {Set<string>} */
	const proposedIds = new Set();
	for (const [index, row] of (list("proposed") ?? []).entries()) {
		const where = `proposed[${index}]`;
		if (!isRecord(row)) {
			add(`${where} is not an object`);
			continue;
		}
		for (const message of keyProblems(row, ["id", "role", "fg", "bg"]))
			add(`${where}: ${message}`);
		if (Object.hasOwn(row, "id")) {
			const id = row["id"];
			if (typeof id !== "string" || !SLUG.test(id))
				add(`${where}: id is not a kebab slug`);
			else if (proposedIds.has(id)) add(`${where}: duplicate id ${id}`);
			else proposedIds.add(id);
		}
		if (
			Object.hasOwn(row, "role") &&
			!ROLE_NAMES.includes(String(row["role"]))
		) {
			add(
				`${where}: role ${String(row["role"])} is not one of ${ROLE_NAMES.join(", ")}`,
			);
		}
		for (const side of ["fg", "bg"]) {
			if (Object.hasOwn(row, side))
				refShapeProblem(row[side], `${where} ${side}`, add);
		}
	}
	for (const [index, row] of (list("brandRatios") ?? []).entries()) {
		const where = `brandRatios[${index}]`;
		if (!isRecord(row)) {
			add(`${where} is not an object`);
			continue;
		}
		for (const message of keyProblems(row, ["fg", "bg", "ratio"]))
			add(`${where}: ${message}`);
		for (const side of ["fg", "bg"]) {
			if (Object.hasOwn(row, side))
				refShapeProblem(row[side], `${where} ${side}`, add);
		}
		if (
			Object.hasOwn(row, "ratio") &&
			!/^\d+\.\d{2}$/.test(String(row["ratio"]))
		) {
			add(`${where}: ratio is not a two-decimal string`);
		}
	}
	return problems;
}

/**
 * @param {unknown} side a `{ ref, hex }` colour
 * @param {string} where
 * @param {(message: string) => void} add
 */
function refShapeProblem(side, where, add) {
	if (!isRecord(side) || keyProblems(side, ["ref", "hex"]).length > 0) {
		add(`${where} is not { ref, hex }`);
	} else if (!isText(side["ref"])) add(`${where}: ref is empty`);
	else if (!/^#[0-9A-F]{6}$/.test(String(side["hex"]))) {
		add(`${where}: hex is not an upper-case #RRGGBB`);
	}
}

// ---------------------------------------------------------------------------
// G1: token coverage
// ---------------------------------------------------------------------------

/**
 * @param {string | undefined} raw
 * @returns {boolean} the value is exactly one `var(--x)`, an alias
 */
function isAlias(raw) {
	return raw !== undefined && PURE_VAR.test(raw);
}

/**
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {object} doc
 * @returns {Set<string>} the custom properties of tokens.css that parse as a colour, aliases resolved, in either theme
 */
function colourTokenNames(tokens, doc) {
	const names = new Set();
	for (const theme of THEMES) {
		for (const name of tokens[theme].keys()) {
			if (resolveColour(name, theme, tokens, doc) !== null) names.add(name);
		}
	}
	return names;
}

/**
 * @param {Array<{ id?: string, layers?: string[] }> | undefined} overlays
 * @param {Array<{ on?: string | string[], fg?: string }>} pairs
 * @param {string[] | undefined} surfaces
 * @returns {Set<string>} the token names that are a backdrop: a surface, an overlay layer or listed in a pair's `on` array
 */
function backdropTokenSet(overlays, pairs, surfaces) {
	const names = new Set();
	const add = (ref) => {
		if (typeof ref === "string" && ref.startsWith("--")) names.add(ref);
	};
	(surfaces ?? []).forEach(add);
	for (const overlay of overlays ?? []) (overlay.layers ?? []).forEach(add);
	for (const pair of pairs) if (Array.isArray(pair.on)) pair.on.forEach(add);
	return names;
}

/**
 * G1 (D-22): every colour token of tokens.css is a pair foreground, a surface, an
 * overlay layer, a pair backdrop or exempt (`g1-uncovered-token`), and the dark
 * block defines every colour token the light block does (`g1-missing-dark`). An
 * alias is judged through its target.
 *
 * @param {string} tokensCss
 * @param {{ surfaces?: string[], overlays?: Array<{ id?: string, layers?: string[] }>, pairs?: Array<{ fg: string, on: string | string[] }>, exempt?: Array<{ name: string }>, localTokens?: object }} doc
 * @returns {ContrastProblem[]}
 */
export function g1Problems(tokensCss, doc) {
	const tokens = themeTokens(tokensCss);
	const pairs = doc.pairs ?? [];
	const covered = new Set([
		...pairs.map((pair) => pair.fg),
		...(doc.exempt ?? []).map((entry) => entry.name),
		...backdropTokenSet(doc.overlays, pairs, doc.surfaces),
	]);
	/** @type {Set<string>} */
	const darkDeclared = new Set();
	for (const found of customPropertyDeclarations(tokensCss)) {
		if (found.selectors.join(" ") === DARK_BLOCK)
			darkDeclared.add(found.property);
	}
	/** @type {ContrastProblem[]} */
	const problems = [];
	for (const name of [...colourTokenNames(tokens, doc)].sort(
		compareCodeUnits,
	)) {
		const lightRaw = tokens.light.get(name);
		const alias = isAlias(lightRaw) && isAlias(tokens.dark.get(name));
		if (!alias && !covered.has(name)) {
			problems.push({
				code: "g1-uncovered-token",
				message: `${name} is a colour token that is no pair foreground, surface, overlay layer, pair backdrop or exempt entry`,
				file: "tokens.css",
			});
		}
		if (lightRaw !== undefined && !darkDeclared.has(name)) {
			problems.push({
				code: "g1-missing-dark",
				message: `${name} is a colour token of :root that the dark block does not define`,
				file: "tokens.css",
			});
		}
	}
	return problems;
}

// ---------------------------------------------------------------------------
// G2: every stylesheet colour use is classified
// ---------------------------------------------------------------------------

const FOREGROUND_PROPERTIES = new Set(["color", "fill", "stroke"]);
const BACKGROUND_PROPERTIES = new Set(["background", "background-color"]);
const OUTLINE_PROPERTIES = new Set(["outline", "outline-color"]);
const OTHER_COLOUR_PROPERTIES = new Set([
	"border",
	"border-top",
	"border-right",
	"border-bottom",
	"border-left",
	"border-color",
	"border-top-color",
	"border-right-color",
	"border-bottom-color",
	"border-left-color",
	"box-shadow",
	"caret-color",
	"accent-color",
	"text-decoration-color",
	"column-rule-color",
]);

/**
 * @param {string} property
 * @returns {"foreground" | "background" | "outline" | "other-colour" | "other"}
 */
function propertyClass(property) {
	if (FOREGROUND_PROPERTIES.has(property)) return "foreground";
	if (BACKGROUND_PROPERTIES.has(property)) return "background";
	if (OUTLINE_PROPERTIES.has(property)) return "outline";
	if (OTHER_COLOUR_PROPERTIES.has(property)) return "other-colour";
	return "other";
}

/**
 * @param {object} doc
 * @param {{ light: Map<string, string>, dark: Map<string, string> }} tokens
 * @param {{ entries?: Array<{ name: string, disposition: string, finding?: string }> } | undefined} tokenMap
 */
function guardContext(doc, tokens, tokenMap) {
	const pairs = doc.pairs ?? [];
	const isToken = (ref) => typeof ref === "string" && ref.startsWith("--");
	const literalOf = (ref) =>
		isToken(ref) || parseColour(ref) === null ? null : normaliseLiteral(ref);
	const backdropLiterals = new Set();
	const addLiteral = (ref) => {
		const literal = typeof ref === "string" ? literalOf(ref) : null;
		if (literal !== null) backdropLiterals.add(literal);
	};
	(doc.surfaces ?? []).forEach(addLiteral);
	for (const overlay of doc.overlays ?? [])
		(overlay.layers ?? []).forEach(addLiteral);
	for (const pair of pairs)
		if (Array.isArray(pair.on)) pair.on.forEach(addLiteral);
	const literals = doc.literals ?? [];
	return {
		tokens,
		doc,
		pairFg: new Set(pairs.map((pair) => pair.fg).filter(isToken)),
		focusFg: new Set(
			pairs
				.filter((pair) => pair.role === "focus")
				.map((pair) => pair.fg)
				.filter(isToken),
		),
		pairFgLiterals: new Set(
			pairs.map((pair) => literalOf(pair.fg)).filter((l) => l !== null),
		),
		focusFgLiterals: new Set(
			pairs
				.filter((pair) => pair.role === "focus")
				.map((pair) => literalOf(pair.fg))
				.filter((l) => l !== null),
		),
		backdropTokens: backdropTokenSet(doc.overlays, pairs, doc.surfaces),
		backdropLiterals,
		exempt: new Map((doc.exempt ?? []).map((entry) => [entry.name, entry])),
		exemptLiterals: new Set(
			literals
				.filter((entry) => Object.hasOwn(entry, "exempt"))
				.map((entry) => normaliseLiteral(entry.value)),
		),
		declaredLiterals: new Set(
			literals.map((entry) => normaliseLiteral(entry.value)),
		),
		colourTokens: colourTokenNames(tokens, doc),
		local: new Set(Object.keys(doc.localTokens ?? {})),
		retire: new Map(
			(tokenMap?.entries ?? []).map((entry) => [entry.name, entry]),
		),
	};
}

/**
 * @param {string} name
 * @param {ReturnType<typeof guardContext>} context
 * @returns {string} the target of an alias chain through tokens.css
 */
function aliasTarget(name, context) {
	let current = name;
	for (let step = 0; step < 8; step += 1) {
		const raw = context.tokens.light.get(current);
		const match = raw === undefined ? null : PURE_VAR.exec(raw);
		if (match === null || match[1] === undefined) break;
		current = match[1];
	}
	return current;
}

/**
 * @param {string} property
 * @param {string} name
 * @param {string | undefined} fallback
 * @param {ReturnType<typeof guardContext>} context
 * @returns {{ code: string, message: string } | "ok" | null} null when the reference is not classified
 */
function classifyReference(property, name, fallback, context) {
	const target = aliasTarget(name, context);
	const via = target === name ? name : `${name} (an alias of ${target})`;
	const kind = propertyClass(property);
	const exemptEntry = context.exempt.get(target);
	const known =
		context.colourTokens.has(target) ||
		context.local.has(target) ||
		exemptEntry !== undefined;

	if (!known) {
		if (kind === "other") return null;
		const entry = context.retire.get(target);
		const routed =
			entry !== undefined &&
			entry.disposition === "retire" &&
			isText(entry.finding) &&
			fallback !== undefined;
		if (!routed) {
			return {
				code: "g2-unclassified-token",
				message: `${via} under ${property} is declared in no stylesheet and is no local token, exemption or retired token with a finding and a fallback`,
			};
		}
		// The fallback is what renders, so it is classified in the name's place.
		const literal = normaliseLiteral(fallback);
		if (kind === "background") {
			return context.backdropLiterals.has(literal)
				? "ok"
				: {
						code: "g2-unknown-surface",
						message: `${via} under ${property} renders its fallback ${fallback}, which is no backdrop literal of the pairs document`,
					};
		}
		if (kind === "foreground") {
			return context.pairFgLiterals.has(literal)
				? "ok"
				: {
						code: "g2-unpaired-foreground",
						message: `${via} under ${property} renders its fallback ${fallback}, which is no pair foreground literal`,
					};
		}
		if (kind === "outline") {
			return context.focusFgLiterals.has(literal)
				? "ok"
				: {
						code: "g2-unpaired-focus",
						message: `${via} under ${property} renders its fallback ${fallback}, which is no focus pair foreground literal`,
					};
		}
		return context.pairFgLiterals.has(literal) ||
			context.exemptLiterals.has(literal)
			? "ok"
			: {
					code: "g2-unclassified-token",
					message: `${via} under ${property} renders its fallback ${fallback}, which is no pair foreground or exempt literal`,
				};
	}

	if (kind === "foreground") {
		return context.pairFg.has(target)
			? "ok"
			: {
					code: "g2-unpaired-foreground",
					message: `${via} is used as text, fill or stroke under ${property} but is no pair foreground`,
				};
	}
	if (kind === "background") {
		const fill = exemptEntry !== undefined && isText(exemptEntry.fill);
		return context.backdropTokens.has(target) || fill
			? "ok"
			: {
					code: "g2-unknown-surface",
					message: `${via} is painted as a background under ${property} but is no surface, overlay layer, pair backdrop or declared fill`,
				};
	}
	if (kind === "outline") {
		return context.focusFg.has(target)
			? "ok"
			: {
					code: "g2-unpaired-focus",
					message: `${via} is used as an outline under ${property} but is no focus pair foreground`,
				};
	}
	return context.pairFg.has(target) || exemptEntry !== undefined
		? "ok"
		: {
				code: "g2-unclassified-token",
				message: `${via} under ${property} is neither a pair foreground nor exempt`,
			};
}

/**
 * G2 (D-22) with its counters: every declaration of every stylesheet (tokens.css
 * included, its `:root` and dark-block token declarations skipped) is checked for
 * a forbidden colour function, for colour literals the document does not declare,
 * and for every `var(--name)` that names a colour token, an exempt name or a local
 * token, or sits under a colour-bearing property.
 *
 * @param {Record<string, string>} stylesheets file name to text
 * @param {Parameters<typeof guardContext>[0]} doc
 * @param {string} tokensCss
 * @param {Parameters<typeof guardContext>[2]} tokenMap
 * @returns {{ problems: ContrastProblem[], classified: number, background: number }}
 */
export function g2Report(stylesheets, doc, tokensCss, tokenMap) {
	const context = guardContext(doc, themeTokens(tokensCss), tokenMap);
	/** @type {ContrastProblem[]} */
	const problems = [];
	let classified = 0;
	let background = 0;
	for (const file of Object.keys(stylesheets).sort(compareCodeUnits)) {
		const isTokens = file.endsWith("tokens.css");
		for (const found of cssDeclarations(stylesheets[file] ?? "")) {
			const block = found.selectors.join(" ");
			if (
				isTokens &&
				found.property.startsWith("--") &&
				(block === LIGHT_BLOCK || block === DARK_BLOCK)
			) {
				continue;
			}
			const property = found.property.toLowerCase();
			const at = { file, line: found.line };
			if (FORBIDDEN_FUNCTION.test(found.value)) {
				problems.push({
					code: "g2-forbidden-function",
					message: `${property}: ${found.value} uses color-mix() or light-dark(), which the contrast evaluator cannot resolve`,
					...at,
				});
				continue;
			}
			for (const literal of colourLiterals(found.value)) {
				if (!context.declaredLiterals.has(literal.normalised)) {
					problems.push({
						code: "g2-undeclared-literal",
						message: `${property}: the colour literal ${literal.text} is not declared in contrast_pairs.json literals`,
						...at,
					});
				}
			}
			for (const reference of varReferences(found.value)) {
				const outcome = classifyReference(
					property,
					reference.name,
					reference.fallback,
					context,
				);
				if (outcome === null) continue;
				classified += 1;
				if (propertyClass(property) === "background") background += 1;
				if (outcome !== "ok") problems.push({ ...outcome, ...at });
			}
		}
	}
	problems.sort(
		(a, b) =>
			compareCodeUnits(a.file ?? "", b.file ?? "") ||
			(a.line ?? 0) - (b.line ?? 0) ||
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.message, b.message),
	);
	return { problems, classified, background };
}

/**
 * @param {Parameters<typeof g2Report>[0]} stylesheets
 * @param {Parameters<typeof g2Report>[1]} doc
 * @param {string} tokensCss
 * @param {Parameters<typeof g2Report>[3]} tokenMap
 * @returns {ContrastProblem[]}
 */
export function g2Problems(stylesheets, doc, tokensCss, tokenMap) {
	return g2Report(stylesheets, doc, tokensCss, tokenMap).problems;
}

// ---------------------------------------------------------------------------
// The proposed v5.1 palette and the BRAND.md ratios (D-26)
// ---------------------------------------------------------------------------

/**
 * @param {{ proposed?: Array<{ id: string, role: "text" | "non-text" | "focus", fg: { hex: string }, bg: { hex: string } }> }} doc
 * @returns {Array<{ id: string, role: string, fgHex: string, bgHex: string, ratio: number, threshold: number, pass: boolean }>}
 */
export function proposedResults(doc) {
	return (doc.proposed ?? []).map((row) => {
		const foreground = parseColour(row.fg.hex);
		const background = parseColour(row.bg.hex);
		if (foreground === null || background === null) {
			throw new Error(
				`proposed pair ${row.id}: ${row.fg.hex} or ${row.bg.hex} is not a colour`,
			);
		}
		const ratio = contrastRatio(foreground, background);
		const threshold = THRESHOLDS[row.role];
		return {
			id: row.id,
			role: row.role,
			fgHex: row.fg.hex,
			bgHex: row.bg.hex,
			ratio,
			threshold,
			pass: ratio >= threshold,
		};
	});
}

/**
 * The UI-SPEC values by id and the `tokens` sources by path, from every section but
 * the states matrix.
 *
 * @param {unknown} uiSpec
 * @returns {{ byId: Map<string, string>, byPath: Map<string, string> }}
 */
export function uiSpecIndex(uiSpec) {
	/** @type {Map<string, string>} */
	const byId = new Map();
	/** @type {Map<string, string>} */
	const byPath = new Map();
	if (!isRecord(uiSpec)) return { byId, byPath };
	for (const [section, values] of Object.entries(uiSpec)) {
		if (section === "states" || !Array.isArray(values)) continue;
		for (const entry of values) {
			if (!isRecord(entry)) continue;
			if (
				typeof entry["id"] === "string" &&
				typeof entry["value"] === "string"
			) {
				byId.set(entry["id"], entry["value"]);
			}
			const source = entry["tokens"];
			if (
				isRecord(source) &&
				typeof source["path"] === "string" &&
				typeof source["value"] === "string"
			) {
				byPath.set(source["path"], source["value"]);
			}
		}
	}
	return { byId, byPath };
}

/**
 * The hexes token_map.json holds for the brand paths it adopts.
 *
 * @param {unknown} tokenMap
 * @returns {Map<string, string>}
 */
function adoptedHexes(tokenMap) {
	/** @type {Map<string, string>} */
	const adopted = new Map();
	if (!isRecord(tokenMap) || !Array.isArray(tokenMap["entries"]))
		return adopted;
	for (const entry of tokenMap["entries"]) {
		if (
			!isRecord(entry) ||
			entry["disposition"] !== "adopt" ||
			!isRecord(entry["brand"])
		)
			continue;
		for (const side of ["light", "dark"]) {
			const ref = entry["brand"][side];
			if (
				isRecord(ref) &&
				typeof ref["token"] === "string" &&
				typeof ref["hex"] === "string"
			) {
				adopted.set(ref["token"], ref["hex"]);
			}
		}
	}
	return adopted;
}

/**
 * Cache-free consistency of the `proposed` set (D-26): its `brandPin` is the pinned
 * commit; every `color.*` ref has a `tokens` source in ui-spec.json whose hex is the
 * ref's hex (ui-spec governs every proposed path), and the map's hex too where the
 * map adopts that path; every UI-SPEC id ref holds that value. `brandRatios` refs
 * are not compared here: brand_quote_check.mjs walks them in the pinned cache.
 *
 * @param {{ brandPin?: string, proposed?: Array<{ id: string, fg: { ref: string, hex: string }, bg: { ref: string, hex: string } }> }} doc
 * @param {{ uiSpec: unknown, tokenMap: unknown, pin: string }} sources
 * @returns {ContrastProblem[]}
 */
export function proposedConsistencyProblems(doc, { uiSpec, tokenMap, pin }) {
	/** @type {ContrastProblem[]} */
	const problems = [];
	if (doc.brandPin !== pin) {
		problems.push({
			code: "proposed-pin-mismatch",
			message:
				"contrast_pairs.json brandPin is not the commit in brand.pin.json",
		});
	}
	const { byId, byPath } = uiSpecIndex(uiSpec);
	const adopted = adoptedHexes(tokenMap);
	for (const row of doc.proposed ?? []) {
		for (const side of ["fg", "bg"]) {
			const { ref, hex } = row[side];
			const where = `proposed ${row.id} ${side}`;
			if (ref.startsWith("color.")) {
				const specHex = byPath.get(ref);
				if (specHex === undefined) {
					problems.push({
						code: "proposed-path-unsourced",
						message: `${where}: ${ref} has no tokens source in ui-spec.json`,
					});
					continue;
				}
				if (specHex.toUpperCase() !== hex.toUpperCase()) {
					problems.push({
						code: "proposed-hex-mismatch",
						message: `${where}: ${ref} is ${hex} here but ${specHex} in ui-spec.json`,
					});
				}
				const mapHex = adopted.get(ref);
				if (
					mapHex !== undefined &&
					mapHex.toUpperCase() !== hex.toUpperCase()
				) {
					problems.push({
						code: "proposed-hex-mismatch",
						message: `${where}: ${ref} is ${hex} here but ${mapHex} in token_map.json`,
					});
				}
			} else {
				const specValue = byId.get(ref);
				if (specValue === undefined) {
					problems.push({
						code: "proposed-id-unknown",
						message: `${where}: ${ref} is no UI-SPEC value id`,
					});
				} else if (specValue.toUpperCase() !== hex.toUpperCase()) {
					problems.push({
						code: "proposed-hex-mismatch",
						message: `${where}: ${ref} is ${hex} here but ${specValue} in ui-spec.json`,
					});
				}
			}
		}
	}
	return problems;
}

/**
 * The BRAND.md "Color: combinations" rows (G3): the quoted ratio is round-to-nearest
 * (12 of 12 agree at 0.005, where floor agrees on 4), so each row must be within
 * 0.005 of the ratio its own hexes give.
 *
 * @param {{ brandRatios?: Array<{ fg: { ref: string, hex: string }, bg: { ref: string, hex: string }, ratio: string }> }} doc
 * @returns {ContrastProblem[]}
 */
export function brandRatioProblems(doc) {
	/** @type {ContrastProblem[]} */
	const problems = [];
	for (const [index, row] of (doc.brandRatios ?? []).entries()) {
		const foreground = parseColour(row.fg.hex);
		const background = parseColour(row.bg.hex);
		const where = `brandRatios[${index}] ${row.fg.ref} on ${row.bg.ref}`;
		if (foreground === null || background === null) {
			problems.push({
				code: "brand-ratio-mismatch",
				message: `${where}: a hex is not a colour`,
			});
			continue;
		}
		const measured = contrastRatio(foreground, background);
		if (Math.abs(measured - Number(row.ratio)) > 0.005 + 1e-9) {
			problems.push({
				code: "brand-ratio-mismatch",
				message: `${where}: measures ${measured.toFixed(4)}:1 but BRAND.md quotes ${row.ratio}:1`,
			});
		}
	}
	return problems;
}
