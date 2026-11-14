// Token map validator, loader and Markdown renderer (Phase 74, SPEC-02, D-15..D-20).
//
// token_map.json is the authored source: one entry per custom property the
// renderer declares or uses, each tied to a brand token or a recorded
// disposition. TOKEN-MAP.md is generated from it by catalog.mjs. The validator
// is pure and cache-free: the stylesheet text, the scanned sources, the brand
// pin, the known-findings fingerprints and the UI-SPEC ids all come in through
// `ctx`, and nothing here reads .brand-cache. A brand hex is verified against
// the pinned tokens.json only by the on-demand brand_quote_check.mjs, which is
// never imported by catalog.mjs and never runs in CI (Phase 71 D-09, D-18).
// Structure is checked before values, so one defect yields one code; the
// problem list is sorted by code, id, message.
import fs from "node:fs";
import {
	closedKeys,
	compareCodeUnits,
	isNonEmptyString,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
} from "./closed.mjs";
import {
	customPropertyDeclarations,
	listTokenScanFiles,
	usedCustomProperties,
} from "./css_scan.mjs";
import { UI_SPEC_PATH } from "./ui_spec.mjs";
import { TOKEN_DISPOSITIONS, UI_SPEC_SECTIONS } from "./vocab.mjs";

export const TOKEN_MAP_PATH = ".storybook/catalog/token_map.json";
export const TOKEN_MAP_MD_PATH = ".storybook/catalog/TOKEN-MAP.md";
export const TOKENS_CSS_PATH = "src/renderer/styles/tokens.css";
const KNOWN_FINDINGS_PATH = "docs/evidence/known-findings.json";

// Every code validateTokenMap can return. token_map.test.ts keeps one mutant
// per code, so a new rule needs a mutant.
export const TOKEN_MAP_CODES = Object.freeze([
	"missing-field",
	"not-object",
	"orphan-entry",
	"schema-version",
	"unknown-field",
	"unmapped",
]);

const TOP_REQUIRED = ["schemaVersion", "brandPin", "entries"];
const ROOT_BLOCK = ":root";
const DARK_BLOCK = '[data-theme="dark"]';

// D-16: each disposition has its own closed key set; `spec` and `aliasOf` are
// optional on every entry.
const ENTRY_REQUIRED = ["name", "disposition"];
const ENTRY_OPTIONAL = ["spec", "aliasOf"];
const DISPOSITION_KEYS = {
	adopt: { required: ["brand"], optional: [] },
	derive: { required: ["from", "rule"], optional: [] },
	"keep-platform": { required: ["reason"], optional: [] },
	"propose-upstream": { required: ["owner", "decision"], optional: [] },
	retire: { required: ["reason"], optional: ["finding"] },
	local: { required: ["reason"], optional: [] },
};

/**
 * The custom properties `tokens.css` declares, by block. Only `:root` and
 * `[data-theme="dark"]` at top level may declare any (D-17); a declaration in
 * any other block, nested or not, is returned in `other`.
 *
 * @param {string} tokensCss
 * @returns {{ root: Map<string, string>, dark: Map<string, string>, other: Array<{ selectors: string[], name: string, line: number }> }}
 */
export function declaredTokens(tokensCss) {
	const root = new Map();
	const dark = new Map();
	const other = [];
	for (const found of customPropertyDeclarations(tokensCss)) {
		const [only, ...rest] = found.selectors;
		if (rest.length === 0 && only === ROOT_BLOCK) {
			root.set(found.property, found.value);
		} else if (rest.length === 0 && only === DARK_BLOCK) {
			dark.set(found.property, found.value);
		} else {
			other.push({
				selectors: found.selectors,
				name: found.property,
				line: found.line,
			});
		}
	}
	return { root, dark, other };
}

/**
 * Every custom property the scanned sources use, sorted and unique, with no
 * prefix filter. Sources are visited in code-unit order of their path.
 *
 * @param {Record<string, string>} sources repo-relative path -> text
 * @returns {string[]}
 */
export function usedTokens(sources) {
	const names = new Set();
	for (const file of Object.keys(sources).sort(compareCodeUnits)) {
		for (const name of usedCustomProperties(file, sources[file] ?? "")) {
			names.add(name);
		}
	}
	return [...names].sort(compareCodeUnits);
}

/**
 * @param {readonly string[]} items
 * @returns {boolean} whether the list is not in code-unit order
 */
function firstDescent(items) {
	for (let index = 1; index < items.length; index += 1) {
		if ((items[index - 1] ?? "") > (items[index] ?? "")) return true;
	}
	return false;
}

/**
 * @param {unknown} doc
 * @param {{ brandPin: string, tokensCss: string, sources: Record<string, string>, findings: Array<{ fingerprint: string, kind: string }>, specIds: string[], specTokenHexes: Record<string, string> }} ctx
 */
export function validateTokenMap(doc, ctx) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "token map must be a JSON object")];
	}
	const structural = closedKeys(doc, TOP_REQUIRED, [], "token map");
	if (doc["schemaVersion"] !== 1) {
		structural.push(problem("schema-version", "schemaVersion must be 1"));
	}
	if (Object.hasOwn(doc, "entries") && !Array.isArray(doc["entries"])) {
		structural.push(problem("not-object", "entries must be an array"));
	}
	if (structural.length > 0) {
		return sortProblems(structural);
	}

	const problems = [];
	/** @type {string[]} */
	const names = [];
	/** @type {unknown[]} */
	const entries = doc["entries"];
	entries.forEach((entry, index) => {
		const where = `entries[${index}]`;
		if (!isPlainObject(entry)) {
			problems.push(problem("not-object", `${where} must be an object`));
			return;
		}
		const name = typeof entry["name"] === "string" ? entry["name"] : null;
		if (name !== null) names.push(name);
		const mark = { id: name ?? where };
		const disposition = entry["disposition"];
		if (
			typeof disposition !== "string" ||
			!TOKEN_DISPOSITIONS.includes(disposition)
		) {
			return;
		}
		const keys =
			DISPOSITION_KEYS[
				/** @type {keyof typeof DISPOSITION_KEYS} */ (disposition)
			];
		const keyProblems = closedKeys(
			entry,
			[...ENTRY_REQUIRED, ...keys.required],
			[...ENTRY_OPTIONAL, ...keys.optional],
			`${where} ${name ?? "(no name)"} (${disposition})`,
		);
		problems.push(...keyProblems.map((found) => ({ ...found, ...mark })));
	});

	// Every custom property declared in tokens.css or used under src/renderer has
	// exactly one entry, and an entry names a property that is one or the other.
	const declared = declaredTokens(ctx.tokensCss);
	const used = usedTokens({ ...ctx.sources, [TOKENS_CSS_PATH]: ctx.tokensCss });
	const known = new Set([
		...declared.root.keys(),
		...declared.dark.keys(),
		...declared.other.map((found) => found.name),
		...used,
	]);
	const mapped = new Set(names);
	for (const name of [...known].sort(compareCodeUnits)) {
		if (!mapped.has(name)) {
			problems.push(
				problem(
					"unmapped",
					`custom property ${name} is declared or used under src/renderer but has no token_map.json entry`,
					{ id: name },
				),
			);
		}
	}
	for (const name of [...mapped].sort(compareCodeUnits)) {
		if (!known.has(name)) {
			problems.push(
				problem(
					"orphan-entry",
					`token_map.json entry ${name} names a custom property that is neither declared in tokens.css nor used under src/renderer`,
					{ id: name },
				),
			);
		}
	}
	return sortProblems(problems);
}

/**
 * Builds the validator context from disk: the brand pin, tokens.css, the
 * scanned renderer sources, the known-findings fingerprints and the UI-SPEC ids
 * and tokens hexes. Nothing reads .brand-cache.
 *
 * @param {string} root
 */
export function loadTokenMapContext(root) {
	const pin = /** @type {{ commit: string }} */ (
		readJson(root, "brand.pin.json")
	);
	/** @type {Record<string, string>} */
	const sources = {};
	for (const relative of listTokenScanFiles(root)) {
		const absolute = resolveInRoot(root, relative);
		if (absolute === null) continue;
		sources[relative] = fs.readFileSync(absolute, "utf8");
	}
	const tokensPath = resolveInRoot(root, TOKENS_CSS_PATH);
	if (tokensPath === null) {
		throw new Error(`${TOKENS_CSS_PATH} is not a path inside the repository`);
	}
	const tokensCss = fs.readFileSync(tokensPath, "utf8");

	const baseline = /** @type {any} */ (readJson(root, KNOWN_FINDINGS_PATH));
	const findings = (Array.isArray(baseline?.entries) ? baseline.entries : [])
		.filter(
			(/** @type {any} */ entry) =>
				typeof entry?.fingerprint === "string" &&
				typeof entry?.kind === "string",
		)
		.map((/** @type {any} */ entry) => ({
			fingerprint: entry.fingerprint,
			kind: entry.kind,
		}));

	const spec = /** @type {any} */ (readJson(root, UI_SPEC_PATH));
	/** @type {string[]} */
	const specIds = [];
	/** @type {Record<string, string>} */
	const specTokenHexes = {};
	/** @param {any} holder */
	const take = (holder) => {
		const tokens = holder?.tokens;
		if (typeof tokens?.path === "string" && typeof tokens?.value === "string") {
			specTokenHexes[tokens.path] = tokens.value;
		}
	};
	for (const section of UI_SPEC_SECTIONS) {
		if (section === "states") continue;
		for (const value of Array.isArray(spec?.[section]) ? spec[section] : []) {
			if (typeof value?.id === "string") specIds.push(value.id);
			take(value);
		}
	}
	for (const stateCell of Array.isArray(spec?.states?.cells)
		? spec.states.cells
		: []) {
		take(stateCell);
	}
	return {
		brandPin: pin.commit,
		tokensCss,
		sources,
		findings,
		specIds: specIds.sort(compareCodeUnits),
		specTokenHexes,
	};
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function cell(text) {
	return String(text)
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/\|/g, "\\|");
}

/**
 * @param {Record<string, any>} entry
 * @returns {string} the brand refs, the derivation sources, the owner or the alias target
 */
function describeTarget(entry) {
	if (isPlainObject(entry["brand"])) {
		const { light, dark } = entry["brand"];
		return `${light.token} ${light.hex} / ${dark.token} ${dark.hex}`;
	}
	if (Array.isArray(entry["from"])) return entry["from"].join(", ");
	if (isNonEmptyString(entry["owner"])) return entry["owner"];
	if (isNonEmptyString(entry["aliasOf"])) return `alias of ${entry["aliasOf"]}`;
	return "";
}

/**
 * @param {Record<string, any>} doc
 * @returns {string}
 */
export function renderTokenMap(doc) {
	const counts = TOKEN_DISPOSITIONS.map(
		(disposition) =>
			`${disposition} ${doc["entries"].filter((/** @type {any} */ entry) => entry["disposition"] === disposition).length}`,
	).join(", ");
	const lines = [
		"<!-- Generated from token_map.json by .storybook/catalog/catalog.mjs. Do not edit: edit token_map.json and run yarn catalog:write. -->",
		"",
		"# Token map",
		"",
		`Brand pin: \`${doc["brandPin"]}\``,
		"",
		`Dispositions: ${counts}. Each custom property declared in tokens.css or used under src/renderer has exactly one entry.`,
		"",
		"| Name | Disposition | Brand (light / dark) or target | Spec | Reason, rule or decision | Finding |",
		"| --- | --- | --- | --- | --- | --- |",
	];
	for (const entry of doc["entries"]) {
		const reason = entry["reason"] ?? entry["rule"] ?? entry["decision"] ?? "";
		lines.push(
			`| ${cell(entry["name"])} | ${entry["disposition"]} | ${cell(describeTarget(entry))} | ${cell(entry["spec"] ?? "")} | ${cell(reason)} | ${cell(entry["finding"] ?? "")} |`,
		);
	}
	return `${lines.join("\n")}\n`;
}
