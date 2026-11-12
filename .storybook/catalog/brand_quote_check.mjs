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
//     commit in brand.pin.json.
// It is never imported by catalog.mjs and never runs in CI: the cache is
// gitignored, so a missing cache fails with `run yarn brand:fetch` instead of
// skipping.
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "../../scripts/is_main_module.mjs";
import { compareCodeUnits, isPlainObject, readJson } from "./closed.mjs";

export const BRAND_QUOTE_USAGE =
	"usage: node .storybook/catalog/brand_quote_check.mjs [--cache <dir>]";

const DEFAULT_CACHE = ".brand-cache/unpacked/exifcleaner-brand";
const RULES_PATH = ".storybook/catalog/copy_lint_rules.json";
const CATALOG_PATH = ".storybook/catalog/catalog.json";
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
 * Pure over text, so a test can call it without a spawn.
 *
 * @param {{ brandText: string, rulesDoc: unknown, catalogDoc: unknown, pin: string }} input
 * @returns {Array<{ code: string, location: string, message: string }>}
 */
export function checkBrandQuotes({ brandText, rulesDoc, catalogDoc, pin }) {
	const problems = [];
	const lines = brandText.split("\n");
	const ranges = headingRanges(brandText);
	const rangesOf = (section) =>
		ranges.filter((range) => range.heading === section);
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
		const id = String(rule["id"]);
		const { section, quote } = rule["source"];
		const range = sectionRange(section, id, "rule");
		if (range === null) continue;
		const body = lines.slice(range.start - 1, range.end).join("\n");
		if (typeof quote !== "string" || !body.includes(quote)) {
			add(
				brandText.includes(String(quote))
					? "rule-quote-not-in-section"
					: "rule-quote-absent",
				id,
				brandText.includes(String(quote))
					? `quote not in section ${section}`
					: `quote absent from BRAND.md (section ${section})`,
			);
		}
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
	let brandText;
	try {
		brandText = fs.readFileSync(brandPath, "utf8");
	} catch {
		console.error(
			`✗ BRAND QUOTE CHECK FAILED: no brand cache at ${path.resolve(root, parsed.cache)}; run yarn brand:fetch`,
		);
		return 1;
	}
	try {
		const rulesDoc = readJson(root, RULES_PATH);
		const catalogDoc = readJson(root, CATALOG_PATH);
		const pin = /** @type {{ commit: string }} */ (readJson(root, PIN_PATH))
			.commit;
		const problems = checkBrandQuotes({ brandText, rulesDoc, catalogDoc, pin });
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
		console.log(
			`✓ BRAND QUOTE CHECK PASSED — ${rules} rules, ${sections} catalog sections`,
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
