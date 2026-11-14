// On-demand brand quote check (Phase 71, D-09; moved here from plan 02).
//
//   node .storybook/catalog/brand_quote_check.mjs [--cache <dir>]
//
// Reads the unpacked brand cache (default .brand-cache/unpacked/exifcleaner-brand
// under the current directory) and verifies, against its BRAND.md:
//   - every copy-lint rule `source.section` is exactly one heading and its
//     `source.quote` occurs verbatim inside that section's own line range
//     (the heading line up to the next heading of any level), not merely
//     somewhere in the file;
//   - every catalog `brand` source `section` is exactly one heading;
//   - the rules file `brandPin` and every catalog brand `pin` equal the
//     commit in brand.pin.json;
//   - ui-spec.json (Phase 74, D-18, D-28): its `brandPin` equals that commit,
//     every `brand.section` is exactly one heading and every `brand.quote`
//     occurs verbatim inside that heading's own line range, and every
//     `tokens.path` resolves in the cache tokens.json to a `$value.hex` equal,
//     case-insensitively, to `tokens.value`;
//   - token_map.json (Phase 74, D-18): its `brandPin` equals that commit, and
//     every `adopt` brand ref and every `derive` source path resolves in the
//     cache tokens.json, the `adopt` ones to a `$value.hex` equal,
//     case-insensitively, to the hex the map holds.
// A section written with a level prefix (`## In the product`) matches only the
// heading of that level and text; BRAND.md repeats two heading texts (`Type`,
// `In the product`) at two levels, and a bare citation of either stays
// ambiguous. There is no flag for the spec checks: the default run is the
// opt-in, fail-closed verification.
// It is never imported by catalog.mjs and never runs in CI: the cache is
// gitignored, so a missing BRAND.md or tokens.json fails with
// `run yarn brand:fetch` instead of skipping.
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "../../scripts/is_main_module.mjs";
import { compareCodeUnits, isPlainObject, readJson } from "./closed.mjs";
import { UI_SPEC_SECTIONS } from "./vocab.mjs";

export const BRAND_QUOTE_USAGE =
	"usage: node .storybook/catalog/brand_quote_check.mjs [--cache <dir>]";

const DEFAULT_CACHE = ".brand-cache/unpacked/exifcleaner-brand";
const RULES_PATH = ".storybook/catalog/copy_lint_rules.json";
const CATALOG_PATH = ".storybook/catalog/catalog.json";
const UI_SPEC_PATH = ".storybook/catalog/ui-spec.json";
const TOKEN_MAP_PATH = ".storybook/catalog/token_map.json";
const PIN_PATH = "brand.pin.json";

/**
 * Every heading with its 1-based line range. `end` is the line before the next
 * heading of any level, or the last line. Headings inside fenced code are not
 * headings.
 *
 * @param {string} markdown
 * @returns {Array<{ heading: string, level: number, start: number, end: number }>}
 */
export function headingRanges(markdown) {
	const lines = markdown.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const found = [];
	let fenced = false;
	lines.forEach((line, index) => {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			return;
		}
		if (fenced) return;
		const match = /^(#{1,6}) (.+?)\s*$/.exec(line);
		if (match !== null) {
			found.push({
				heading: match[2] ?? "",
				level: (match[1] ?? "").length,
				start: index + 1,
				end: lines.length,
			});
		}
	});
	for (let index = 0; index + 1 < found.length; index += 1) {
		const current = found[index];
		const next = found[index + 1];
		if (current !== undefined && next !== undefined) {
			current.end = next.start - 1;
		}
	}
	return found;
}

function catalogBrandSources(catalogDoc) {
	const found = [];
	const visit = (owner, claims) => {
		(Array.isArray(claims) ? claims : []).forEach((claim, index) => {
			if (isPlainObject(claim) && isPlainObject(claim["source"])) {
				const source = claim["source"];
				if (source["kind"] === "brand") {
					found.push({
						location: `${owner} [${index}]`,
						pin: source["pin"],
						section: source["section"],
					});
				}
			}
		});
	};
	if (!isPlainObject(catalogDoc)) return found;
	const core = catalogDoc["coreJob"];
	if (isPlainObject(core)) visit("coreJob", core["clauses"]);
	for (const persona of Array.isArray(catalogDoc["personas"])
		? catalogDoc["personas"]
		: []) {
		if (!isPlainObject(persona)) continue;
		visit(`${persona["id"]} claims`, persona["claims"]);
		visit(`${persona["id"]} red flags`, persona["redFlags"]);
	}
	for (const job of Array.isArray(catalogDoc["jobs"])
		? catalogDoc["jobs"]
		: []) {
		if (isPlainObject(job)) visit(`${job["id"]} claims`, job["claims"]);
	}
	return found;
}

/**
 * The `$value.hex` of a dotted path in a parsed tokens.json, or null. Every step
 * must be an own property of a plain object (`Object.hasOwn`, never `in` and
 * never bracket access on an unchecked key), so `__proto__`, `constructor` and
 * `prototype` can never be walked into.
 *
 * @param {unknown} tokensDoc
 * @param {string} dottedPath
 * @returns {string | null}
 */
export function resolveTokenPath(tokensDoc, dottedPath) {
	if (typeof dottedPath !== "string" || dottedPath === "") return null;
	/** @type {unknown} */
	let current = tokensDoc;
	for (const key of dottedPath.split(".")) {
		if (!isPlainObject(current) || !Object.hasOwn(current, key)) return null;
		current = current[key];
	}
	if (!isPlainObject(current) || !Object.hasOwn(current, "$value")) return null;
	const value = current["$value"];
	if (!isPlainObject(value) || !Object.hasOwn(value, "hex")) return null;
	const hex = value["hex"];
	return typeof hex === "string" ? hex : null;
}

// Every authored entry of ui-spec.json that can carry a source: the section
// values (every section but states) and the states cells that hold a value.
function specEntries(specDoc) {
	if (!isPlainObject(specDoc)) return [];
	const found = [];
	for (const section of UI_SPEC_SECTIONS) {
		if (section === "states") continue;
		const values = specDoc[section];
		if (!Array.isArray(values)) continue;
		for (const value of values) {
			if (isPlainObject(value))
				found.push({ location: String(value["id"]), entry: value });
		}
	}
	const states = specDoc["states"];
	if (isPlainObject(states) && Array.isArray(states["cells"])) {
		for (const cell of states["cells"]) {
			if (!isPlainObject(cell)) continue;
			found.push({
				location: `states ${cell["component"]}/${cell["state"]}/${cell["theme"]}`,
				entry: cell,
			});
		}
	}
	return found;
}

/**
 * @param {unknown} specDoc
 * @returns {Array<{ location: string, section: unknown, quote: unknown }>}
 */
export function specBrandSources(specDoc) {
	return specEntries(specDoc).flatMap(({ location, entry }) => {
		const source = entry["brand"];
		return isPlainObject(source)
			? [{ location, section: source["section"], quote: source["quote"] }]
			: [];
	});
}

/**
 * @param {unknown} specDoc
 * @returns {Array<{ location: string, path: unknown, value: unknown }>}
 */
export function specTokenSources(specDoc) {
	return specEntries(specDoc).flatMap(({ location, entry }) => {
		const source = entry["tokens"];
		return isPlainObject(source)
			? [{ location, path: source["path"], value: source["value"] }]
			: [];
	});
}

/**
 * Every brand colour reference of token_map.json: the `adopt` entries' light and
 * dark `{ token, hex }`, each with the hex the map holds, and the `derive`
 * entries' `from` paths, which carry no hex. Malformed entries are skipped (the
 * cache-free validator reports them).
 *
 * @param {unknown} tokenMapDoc
 * @returns {Array<{ location: string, name: string, token: unknown, hex: unknown }>}
 */
export function mapBrandRefs(tokenMapDoc) {
	if (!isPlainObject(tokenMapDoc) || !Array.isArray(tokenMapDoc["entries"])) {
		return [];
	}
	const found = [];
	for (const entry of tokenMapDoc["entries"]) {
		if (!isPlainObject(entry)) continue;
		const name = String(entry["name"]);
		if (entry["disposition"] === "adopt" && isPlainObject(entry["brand"])) {
			for (const side of ["light", "dark"]) {
				const ref = entry["brand"][side];
				if (!isPlainObject(ref)) continue;
				found.push({
					location: `${name} brand.${side}`,
					name,
					token: ref["token"],
					hex: ref["hex"],
				});
			}
		} else if (
			entry["disposition"] === "derive" &&
			Array.isArray(entry["from"])
		) {
			for (const token of entry["from"]) {
				found.push({
					location: `${name} from`,
					name,
					token,
					hex: undefined,
				});
			}
		}
	}
	return found;
}

/**
 * Pure over text, so a test can call it without a spawn. `specDoc`, `tokenMapDoc`
 * and `tokensDoc` are optional: without a `specDoc` only the rules and the
 * catalog are checked, and without a `tokenMapDoc` the map is not checked.
 *
 * @param {{ brandText: string, rulesDoc: unknown, catalogDoc: unknown, pin: string, specDoc?: unknown, tokenMapDoc?: unknown, tokensDoc?: unknown }} input
 * @returns {Array<{ code: string, location: string, message: string }>}
 */
export function checkBrandQuotes({
	brandText,
	rulesDoc,
	catalogDoc,
	pin,
	specDoc,
	tokenMapDoc,
	tokensDoc,
}) {
	const problems = [];
	const lines = brandText.split("\n");
	const ranges = headingRanges(brandText);
	// A level-prefixed section (`## Type`, `### In the product`) matches the
	// heading of that level and text only; a bare one matches the text at any
	// level, which is how every rule and catalog citation resolves.
	const rangesOf = (section) => {
		const leveled = /^(#{1,6}) (.+)$/.exec(section);
		if (leveled === null) {
			return ranges.filter((range) => range.heading === section);
		}
		const level = (leveled[1] ?? "").length;
		return ranges.filter(
			(range) => range.level === level && range.heading === leveled[2],
		);
	};
	const add = (code, location, message) =>
		problems.push({ code, location, message });

	// Returns the unique range, or null after recording why not.
	const sectionRange = (section, location, kind) => {
		const matches = typeof section === "string" ? rangesOf(section) : [];
		if (matches.length === 0) {
			add(
				`${kind}-section-not-heading`,
				location,
				`section ${JSON.stringify(section)} is not a heading of BRAND.md`,
			);
			return null;
		}
		if (matches.length > 1) {
			add(
				`${kind}-section-ambiguous`,
				location,
				`section ${JSON.stringify(section)} is more than one heading of BRAND.md`,
			);
			return null;
		}
		return matches[0] ?? null;
	};

	// The quote must sit inside its own section's line range, not merely
	// somewhere in the file.
	const checkQuote = (kind, location, section, quote) => {
		const range = sectionRange(section, location, kind);
		if (range === null) return;
		const body = lines.slice(range.start - 1, range.end).join("\n");
		if (typeof quote !== "string" || !body.includes(quote)) {
			const inFile = brandText.includes(String(quote));
			add(
				inFile ? `${kind}-quote-not-in-section` : `${kind}-quote-absent`,
				location,
				inFile
					? `quote not in section ${section}`
					: `quote absent from BRAND.md (section ${section})`,
			);
		}
	};

	const rules =
		isPlainObject(rulesDoc) && Array.isArray(rulesDoc["rules"])
			? rulesDoc["rules"]
			: [];
	if (isPlainObject(rulesDoc) && rulesDoc["brandPin"] !== pin) {
		add(
			"rule-pin-mismatch",
			"copy_lint_rules.json",
			"brandPin is not the commit in brand.pin.json",
		);
	}
	for (const rule of rules) {
		if (!isPlainObject(rule) || !isPlainObject(rule["source"])) continue;
		const { section, quote } = rule["source"];
		checkQuote("rule", String(rule["id"]), section, quote);
	}

	const sources = catalogBrandSources(catalogDoc);
	for (const source of sources) {
		if (source.pin !== pin) {
			add(
				"catalog-pin-mismatch",
				source.location,
				"pin is not the commit in brand.pin.json",
			);
		}
		sectionRange(source.section, source.location, "catalog");
	}

	if (isPlainObject(specDoc)) {
		if (specDoc["brandPin"] !== pin) {
			add(
				"spec-pin-mismatch",
				"ui-spec.json",
				"brandPin is not the commit in brand.pin.json",
			);
		}
		for (const source of specBrandSources(specDoc)) {
			checkQuote("spec", source.location, source.section, source.quote);
		}
		for (const source of specTokenSources(specDoc)) {
			const cacheHex = resolveTokenPath(tokensDoc, String(source.path));
			if (cacheHex === null) {
				add(
					"spec-token-path-missing",
					source.location,
					`tokens path ${source.path} is not a colour in tokens.json`,
				);
			} else if (
				cacheHex.toUpperCase() !== String(source.value).toUpperCase()
			) {
				add(
					"spec-token-hex-mismatch",
					source.location,
					`tokens path ${source.path} is ${cacheHex} in tokens.json but ${source.value} in ui-spec.json`,
				);
			}
		}
	}
	if (isPlainObject(tokenMapDoc)) {
		if (tokenMapDoc["brandPin"] !== pin) {
			add(
				"map-pin-mismatch",
				"token_map.json",
				"brandPin is not the commit in brand.pin.json",
			);
		}
		for (const ref of mapBrandRefs(tokenMapDoc)) {
			const cacheHex = resolveTokenPath(tokensDoc, String(ref.token));
			if (cacheHex === null) {
				add(
					"map-token-path-missing",
					ref.location,
					`tokens path ${ref.token} is not a colour in tokens.json (token_map.json)`,
				);
			} else if (
				ref.hex !== undefined &&
				cacheHex.toUpperCase() !== String(ref.hex).toUpperCase()
			) {
				add(
					"map-token-hex-mismatch",
					ref.location,
					`${ref.name}: tokens path ${ref.token} is ${cacheHex} in tokens.json but ${ref.hex} in token_map.json`,
				);
			}
		}
	}
	return problems.sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.location, b.location) ||
			compareCodeUnits(a.message, b.message),
	);
}

function parseArguments(argv) {
	if (argv.length === 0) return { cache: DEFAULT_CACHE };
	if (argv.length === 2 && argv[0] === "--cache" && argv[1] !== undefined) {
		return { cache: argv[1] };
	}
	return null;
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2)) {
	const parsed = parseArguments(argv);
	if (parsed === null) {
		console.error(BRAND_QUOTE_USAGE);
		return 1;
	}
	const root = process.cwd();
	const brandPath = path.resolve(root, parsed.cache, "BRAND.md");
	const tokensPath = path.resolve(root, parsed.cache, "tokens.json");
	let brandText;
	let tokensText;
	try {
		brandText = fs.readFileSync(brandPath, "utf8");
		tokensText = fs.readFileSync(tokensPath, "utf8");
	} catch {
		console.error(
			`✗ BRAND QUOTE CHECK FAILED: no brand cache at ${path.resolve(root, parsed.cache)}; run yarn brand:fetch`,
		);
		return 1;
	}
	try {
		const rulesDoc = readJson(root, RULES_PATH);
		const catalogDoc = readJson(root, CATALOG_PATH);
		const specDoc = readJson(root, UI_SPEC_PATH);
		const tokenMapDoc = readJson(root, TOKEN_MAP_PATH);
		const tokensDoc = JSON.parse(tokensText);
		const pin = /** @type {{ commit: string }} */ (readJson(root, PIN_PATH))
			.commit;
		const problems = checkBrandQuotes({
			brandText,
			rulesDoc,
			catalogDoc,
			pin,
			specDoc,
			tokenMapDoc,
			tokensDoc,
		});
		if (problems.length > 0) {
			const text = problems
				.map((found) => `${found.location}: ${found.message}`)
				.join("; ");
			console.error(`✗ BRAND QUOTE CHECK FAILED: ${text}`);
			return 1;
		}
		const rules = Array.isArray(/** @type {any} */ (rulesDoc)?.rules)
			? /** @type {any} */ (rulesDoc).rules.length
			: 0;
		const sections = catalogBrandSources(catalogDoc).length;
		const quotes = specBrandSources(specDoc).length;
		const tokens = specTokenSources(specDoc).length;
		const mapRefs = mapBrandRefs(tokenMapDoc).length;
		console.log(
			`✓ BRAND QUOTE CHECK PASSED — ${rules} rules, ${sections} catalog sections, ${quotes} spec quotes, ${tokens} spec tokens, ${mapRefs} map brand refs`,
		);
		console.log(`pin ${pin}`);
		return 0;
	} catch (error) {
		console.error(
			`✗ BRAND QUOTE CHECK FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
