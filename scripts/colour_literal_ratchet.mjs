// Colour-literal ratchet over src/ (Phase 76, GAT-03, D-15).
//
//   node scripts/colour_literal_ratchet.mjs --check
//   node scripts/colour_literal_ratchet.mjs --write
//
// Every colour literal under src/ outside src/renderer/styles/tokens.css is keyed in
// docs/evidence/colour-literals.json by (file, normalised literal) with a count, and the scan
// must equal that baseline exactly: a new literal is `unlisted`, a literal that left the tree is
// `stale` until its row is removed, a changed count is `count`. The key is the pair, never a
// bare total, so trading one literal for another is two problems and not zero. #007AFF (the
// system accent) is held to exactly tokens.css 2 and src/domain/accent_color.ts 1.
//
// What is scanned: `.ts`, `.tsx`, `.css` and `.mjs` files under src/, excluding stories
// (`*.stories.ts`, `*.stories.tsx`) and src/renderer/story_support (test support, never
// bundled), with comments stripped first. What counts as a literal: a hex, an `rgb(` or
// `rgba(` call (read with `colourLiterals`, imported read-only; `contrast_model.mjs` is the
// evaluator of contrast.test.ts and is not edited here), and, from the local passes below,
// `hsl(`, `hsla(`, `hwb(`, `lab(`, `lch(`, `oklab(`, `oklch(` and `color-mix(` calls (the whole
// call is one literal) and CSS named colours. A named colour (and `white`, `black`,
// `transparent`) counts only where a colour is meant: in a CSS colour-bearing declaration or
// custom property, or as the quoted value of a colour attribute in a script (`fill="white"`,
// `color: "red"`), never in prose. `rgba(0, 0, 0, x)` shadows count until a shadow token exists.
//
// Known limit: in a script a 3, 4, 6 or 8 digit hex that is not a colour (an element id such
// as "#add" in a selector string) is read as one; rename the id. The scan is linear: one pass
// with sticky patterns and a parenthesis depth counter, no nested quantifiers (T-76-18).
//
// The merge-base check (the baseline may only shrink, D-10) is scripts/shrink_only_check.mjs.
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "./is_main_module.mjs";
import {
	cssDeclarations,
	stripScriptComments,
} from "../.storybook/catalog/css_scan.mjs";
import {
	colourLiterals,
	compareCodeUnits,
	normaliseLiteral,
} from "../tests/renderer/contrast/contrast_model.mjs";

export const BASELINE_PATH = "docs/evidence/colour-literals.json";

const SCAN_ROOT = "src";
const TOKENS_CSS = "src/renderer/styles/tokens.css";
const STORY_SUPPORT = "src/renderer/story_support/";
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs"]);
const STORY_FILE = /\.stories\.tsx?$/;

export const ACCENT_LITERAL = "#007aff";

// The system accent appears at exactly these sites (path to count): the two themes' tokens in
// tokens.css and the TypeScript default in src/domain/accent_color.ts.
export const ACCENT_SITES = Object.freeze({
	"src/domain/accent_color.ts": 1,
	[TOKENS_CSS]: 2,
});

const IDENT_CHAR = /[A-Za-z0-9_-]/;
const CALL_AT = /(?:hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/iy;

// CSS Color 4 named colours, less the three handled as keywords (`white`, `black`,
// `transparent`; `colourLiterals` reads those in CSS).
const NAMED_COLOURS = new Set(
	(
		"aliceblue antiquewhite aqua aquamarine azure beige bisque blanchedalmond blue blueviolet " +
		"brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan " +
		"darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
		"darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue " +
		"darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey " +
		"dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod " +
		"gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
		"lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
		"lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue " +
		"lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta " +
		"maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
		"mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
		"mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
		"palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
		"powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
		"seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
		"steelblue tan teal thistle tomato turquoise violet wheat whitesmoke yellow yellowgreen"
	).split(" "),
);
const KEYWORD_COLOURS = new Set(["white", "black", "transparent"]);

// `fill="white"`, `stroke={"red"}`, `color: 'tomato'`, `"background-color": "gold"`: the quoted
// value of a colour-bearing key in a script.
const SCRIPT_COLOUR_ATTRIBUTE =
	/\b(?:fill|stroke|color|background|backgroundColor|background-color|borderColor|border-color|stopColor|stop-color|floodColor|flood-color|outlineColor|outline-color|caretColor|caret-color|accentColor|accent-color)["']?\s*[:=]\s*\{?\s*["'`]\s*([A-Za-z]+)\s*["'`]/gi;

/**
 * @param {string} property
 * @returns {boolean} true when the property's value is a colour or holds one
 */
function isColourBearing(property) {
	const name = property.trim().toLowerCase();
	return (
		name.startsWith("--") ||
		name.includes("color") ||
		/^(?:background|border|outline|box-shadow|text-shadow|fill|stroke|filter|column-rule|text-decoration|text-emphasis|mask|-webkit-text-stroke)/.test(
			name,
		)
	);
}

/**
 * Every colour function call of the text as `{ start, end }` (end exclusive), the closing
 * parenthesis found by a depth counter; an unclosed call runs to the end.
 *
 * @param {string} text
 * @returns {Array<{ start: number, end: number }>}
 */
function functionCalls(text) {
	/** @type {Array<{ start: number, end: number }>} */
	const calls = [];
	let index = 0;
	while (index < text.length) {
		const char = text[index] ?? "";
		const previous = index === 0 ? "" : (text[index - 1] ?? "");
		if (
			/[A-Za-z]/.test(char) &&
			(previous === "" || !IDENT_CHAR.test(previous))
		) {
			CALL_AT.lastIndex = index;
			const call = CALL_AT.exec(text);
			if (call !== null) {
				let depth = 0;
				let end = text.length;
				for (let at = index + call[0].length - 1; at < text.length; at += 1) {
					const current = text[at];
					if (current === "(") depth += 1;
					else if (current === ")") {
						depth -= 1;
						if (depth === 0) {
							end = at + 1;
							break;
						}
					}
				}
				calls.push({ start: index, end });
				index = end;
				continue;
			}
		}
		index += 1;
	}
	return calls;
}

/**
 * @param {string} text
 * @param {Array<{ start: number, end: number }>} spans
 * @returns {string} the text with each span replaced by spaces
 */
function blankSpans(text, spans) {
	let out = "";
	let copied = 0;
	for (const span of spans) {
		out += text.slice(copied, span.start) + " ".repeat(span.end - span.start);
		copied = span.end;
	}
	return out + text.slice(copied);
}

/**
 * @param {string} value
 * @returns {string} the value with quoted strings and `url(...)` bodies replaced by spaces
 */
function withoutStringsAndUrls(value) {
	return value
		.replace(/"[^"]*"|'[^']*'/g, (found) => " ".repeat(found.length))
		.replace(/url\([^)]*\)/gi, (found) => " ".repeat(found.length));
}

/**
 * @param {string} text
 * @returns {string[]} normalised literals of the shared grammar: hex, rgb(a), colour calls
 */
function sharedLiterals(text) {
	const calls = functionCalls(text);
	const found = calls.map((span) =>
		normaliseLiteral(text.slice(span.start, span.end)),
	);
	for (const literal of colourLiterals(blankSpans(text, calls))) {
		const { normalised } = literal;
		if (normalised.startsWith("#") || normalised.startsWith("rgb")) {
			found.push(normalised);
		}
	}
	return found;
}

/**
 * @param {string} css
 * @returns {string[]}
 */
function cssLiterals(css) {
	/** @type {string[]} */
	const found = [];
	for (const declaration of cssDeclarations(css)) {
		const bearing = isColourBearing(declaration.property);
		const calls = functionCalls(declaration.value);
		for (const span of calls) {
			found.push(
				normaliseLiteral(declaration.value.slice(span.start, span.end)),
			);
		}
		const rest = blankSpans(declaration.value, calls);
		for (const literal of colourLiterals(rest)) {
			const { normalised } = literal;
			const isKeyword =
				!normalised.startsWith("#") && !normalised.startsWith("rgb");
			if (!isKeyword || bearing) found.push(normalised);
		}
		if (bearing) {
			for (const identifier of withoutStringsAndUrls(rest).matchAll(
				/[A-Za-z_-][A-Za-z0-9_-]*/g,
			)) {
				const name = identifier[0].toLowerCase();
				if (NAMED_COLOURS.has(name)) found.push(name);
			}
		}
	}
	return found;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function scriptLiterals(text) {
	const stripped = stripScriptComments(text);
	const calls = functionCalls(stripped);
	const found = sharedLiterals(stripped);
	const rest = blankSpans(stripped, calls);
	for (const attribute of rest.matchAll(SCRIPT_COLOUR_ATTRIBUTE)) {
		const name = (attribute[1] ?? "").toLowerCase();
		if (NAMED_COLOURS.has(name) || KEYWORD_COLOURS.has(name)) found.push(name);
	}
	return found;
}

/**
 * The normalised colour literals of one file's text, duplicates kept (the count is the length),
 * in code-unit order.
 *
 * @param {{ file: string, text: string }} subject
 * @returns {string[]}
 */
export function colourLiteralsInSource({ file, text }) {
	const found = file.endsWith(".css")
		? cssLiterals(text)
		: scriptLiterals(text);
	return found.sort(compareCodeUnits);
}

/**
 * @param {string} dir absolute
 * @param {string} root absolute
 * @param {string[]} out repo-relative POSIX paths
 * @returns {string[]}
 */
function listSources(dir, root, out = []) {
	const entries = fs
		.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => compareCodeUnits(a.name, b.name));
	for (const entry of entries) {
		const absolute = path.join(dir, entry.name);
		const relative = path.relative(root, absolute).split(path.sep).join("/");
		if (entry.isDirectory()) {
			listSources(absolute, root, out);
		} else if (
			EXTENSIONS.has(path.extname(entry.name)) &&
			!STORY_FILE.test(entry.name) &&
			!relative.startsWith(STORY_SUPPORT)
		) {
			out.push(relative);
		}
	}
	return out;
}

/**
 * @param {{ root: string }} subject the directory that holds src/
 * @returns {{ rows: Array<{ file: string, literal: string, count: number }>, accent: Record<string, number> }}
 */
export function scanColourLiterals({ root }) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	/** @type {Record<string, number>} */
	const accent = {};
	for (const file of listSources(path.join(root, SCAN_ROOT), root)) {
		const text = fs.readFileSync(path.join(root, file), "utf8");
		for (const literal of colourLiteralsInSource({ file, text })) {
			if (literal === ACCENT_LITERAL) {
				accent[file] = (accent[file] ?? 0) + 1;
			}
			if (file !== TOKENS_CSS) {
				const key = `${file}\n${literal}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
	}
	const rows = [...counts].map(([key, count]) => {
		const [file = "", literal = ""] = key.split("\n");
		return { file, literal, count };
	});
	rows.sort(
		(a, b) =>
			compareCodeUnits(a.file, b.file) ||
			compareCodeUnits(a.literal, b.literal),
	);
	return {
		rows,
		accent: Object.fromEntries(
			Object.entries(accent).sort(([a], [b]) => compareCodeUnits(a, b)),
		),
	};
}

/**
 * @param {unknown} value
 * @returns {value is { file: string, literal: string, count: number }}
 */
function isRow(value) {
	if (typeof value !== "object" || value === null) return false;
	const row = /** @type {Record<string, unknown>} */ (value);
	return (
		typeof row["file"] === "string" &&
		typeof row["literal"] === "string" &&
		typeof row["count"] === "number" &&
		Number.isInteger(row["count"]) &&
		row["count"] > 0
	);
}

/**
 * Both-ways comparison of the scan with the baseline, plus the #007AFF site rule.
 *
 * @param {{ scan: { rows: Array<{ file: string, literal: string, count: number }>, accent: Record<string, number> }, baseline: unknown }} subject
 * @returns {Array<{ code: string, message: string }>}
 */
export function ratchetProblems({ scan, baseline }) {
	/** @type {Array<{ code: string, message: string }>} */
	const problems = [];
	const rows =
		typeof baseline === "object" && baseline !== null
			? /** @type {Record<string, unknown>} */ (baseline)["rows"]
			: undefined;
	const version =
		typeof baseline === "object" && baseline !== null
			? /** @type {Record<string, unknown>} */ (baseline)["schemaVersion"]
			: undefined;
	if (version !== 1 || !Array.isArray(rows) || !rows.every(isRow)) {
		return [
			{
				code: "shape",
				message: `${BASELINE_PATH} must be { "schemaVersion": 1, "rows": [{ file, literal, count }] } with positive integer counts`,
			},
		];
	}
	/** @type {Map<string, number>} */
	const baseCounts = new Map();
	for (const row of rows) {
		baseCounts.set(`${row.file}\n${row.literal}`, row.count);
	}
	/** @type {Set<string>} */
	const scanned = new Set();
	for (const row of scan.rows) {
		const key = `${row.file}\n${row.literal}`;
		scanned.add(key);
		const listed = baseCounts.get(key);
		if (listed === undefined) {
			problems.push({
				code: "unlisted",
				message: `${row.file}|${row.literal} x${row.count} is not in the baseline; use a token (the baseline may only shrink)`,
			});
		} else if (listed !== row.count) {
			problems.push({
				code: "count",
				message: `${row.file}|${row.literal} is x${row.count} in the tree and x${listed} in the baseline`,
			});
		}
	}
	for (const row of rows) {
		if (!scanned.has(`${row.file}\n${row.literal}`)) {
			problems.push({
				code: "stale",
				message: `${row.file}|${row.literal} is in the baseline but no longer in the tree; remove the row (node scripts/colour_literal_ratchet.mjs --write)`,
			});
		}
	}
	const sites = new Set([
		...Object.keys(ACCENT_SITES),
		...Object.keys(scan.accent),
	]);
	for (const file of [...sites].sort(compareCodeUnits)) {
		const found = scan.accent[file] ?? 0;
		const expected =
			/** @type {Record<string, number>} */ (ACCENT_SITES)[file] ?? 0;
		if (found !== expected) {
			problems.push({
				code: "accent",
				message: `#007AFF at ${file}: found ${found}, expected ${expected} (the system accent has exactly tokens.css 2 and src/domain/accent_color.ts 1)`,
			});
		}
	}
	return problems;
}

/**
 * @param {string[]} argv
 * @param {{ root?: string | undefined }} [options]
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2), options = {}) {
	try {
		const root = options.root ?? process.cwd();
		const flags = new Set(argv);
		const unknown = argv.filter(
			(argument) => argument !== "--check" && argument !== "--write",
		);
		if (unknown.length > 0) {
			throw new Error(`unknown argument: ${unknown.join(" ")}`);
		}
		const writing = flags.has("--write");
		if (writing === flags.has("--check")) {
			throw new Error("pass exactly one of --check or --write");
		}
		const scan = scanColourLiterals({ root });
		if (writing) {
			const target = path.join(root, BASELINE_PATH);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(
				target,
				`${JSON.stringify({ schemaVersion: 1, rows: scan.rows }, null, "\t")}\n`,
			);
			console.log(
				`✓ COLOUR LITERAL BASELINE WRITTEN — ${scan.rows.length} rows in ${new Set(scan.rows.map((row) => row.file)).size} files`,
			);
			return 0;
		}
		/** @type {unknown} */
		let baseline;
		try {
			baseline = JSON.parse(
				fs.readFileSync(path.join(root, BASELINE_PATH), "utf8"),
			);
		} catch (error) {
			throw new Error(
				`cannot read ${BASELINE_PATH}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		const problems = ratchetProblems({ scan, baseline });
		if (problems.length > 0) {
			console.error(
				`✗ COLOUR LITERAL RATCHET FAILED:\n${problems.map((problem) => `  ${problem.code}: ${problem.message}`).join("\n")}`,
			);
			return 1;
		}
		console.log(
			`✓ COLOUR LITERAL RATCHET PASSED — ${scan.rows.length} rows in ${new Set(scan.rows.map((row) => row.file)).size} files`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ COLOUR LITERAL RATCHET FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
