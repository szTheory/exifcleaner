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
	dynamicCustomPropertyNames,
	listTokenScanFiles,
	usedCustomProperties,
} from "./css_scan.mjs";
import { UI_SPEC_PATH } from "./ui_spec.mjs";
import {
	THEME_INVARIANT_PREFIXES,
	TOKEN_DISPOSITIONS,
	UI_SPEC_SECTIONS,
} from "./vocab.mjs";

export const TOKEN_MAP_PATH = ".storybook/catalog/token_map.json";
export const TOKEN_MAP_MD_PATH = ".storybook/catalog/TOKEN-MAP.md";
export const TOKENS_CSS_PATH = "src/renderer/styles/tokens.css";
const KNOWN_FINDINGS_PATH = "docs/evidence/known-findings.json";

// Every code validateTokenMap can return. token_map.test.ts keeps one mutant
// per code, so a new rule needs a mutant.
export const TOKEN_MAP_CODES = Object.freeze([
	"alias-mismatch",
	"bad-brand-ref",
	"bad-disposition",
	"bad-hex",
	"bad-type",
	"brand-hex-inconsistent",
	"duplicate-entry",
	"dynamic-token-name",
	"missing-field",
	"not-object",
	"orphan-entry",
	"pin-mismatch",
	"schema-version",
	"theme-parity",
	"unknown-block",
	"unknown-field",
	"unknown-finding",
	"unknown-spec-id",
	"unmapped",
	"unreferenced-finding",
	"unsorted",
]);

const TOP_REQUIRED = ["schemaVersion", "brandPin", "entries"];
// The cache-free tier of the brand reference (D-18): the shape of a colour path
// and of the uppercase #RRGGBB the pinned tokens.json holds. Whether the path
// and the hex are really in that file is the on-demand brand_quote_check.mjs.
const BRAND_COLOUR_PREFIX = "color.";
const BRAND_HEX = /^#[0-9A-F]{6}$/;
// A backward-compat alias: the same single `var(--x)` in both theme blocks.
const ALIAS_VALUE = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/;
const TOKEN_MAP_GAP_KIND = "token-map-gap";
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
 * One brand colour reference `{ token, hex }`. A defect in the reference's own
 * shape is reported once and the reference is not compared any further.
 *
 * @param {unknown} ref
 * @param {string} where
 * @param {{ id: string }} mark
 * @param {Array<{ code: string, message: string }>} problems
 * @param {Map<string, Set<string>>} hexes brand path -> the hexes the map gives it
 */
function checkBrandRef(ref, where, mark, problems, hexes) {
	if (!isPlainObject(ref)) {
		problems.push(problem("bad-type", `${where} must be an object`, mark));
		return;
	}
	const shape = closedKeys(ref, ["token", "hex"], [], where);
	if (shape.length > 0) {
		problems.push(...shape.map((found) => ({ ...found, ...mark })));
		return;
	}
	const { token, hex } = ref;
	if (!isNonEmptyString(token) || typeof hex !== "string") {
		problems.push(
			problem("bad-type", `${where} token and hex must be strings`, mark),
		);
		return;
	}
	if (!token.startsWith(BRAND_COLOUR_PREFIX)) {
		problems.push(
			problem(
				"bad-brand-ref",
				`${where} token ${token} must be a ${BRAND_COLOUR_PREFIX} path in tokens.json`,
				mark,
			),
		);
	}
	if (!BRAND_HEX.test(hex)) {
		problems.push(
			problem(
				"bad-hex",
				`${where} hex ${hex} must be an uppercase #RRGGBB`,
				mark,
			),
		);
		return;
	}
	const seen = hexes.get(token) ?? new Set();
	seen.add(hex);
	hexes.set(token, seen);
}

/**
 * The value rules of one entry whose key set is already valid (D-16): the
 * per-disposition fields, the optional `spec` and `aliasOf`, and the alias rule.
 *
 * @param {Record<string, any>} entry
 * @param {string} where
 * @param {{ id: string }} mark
 * @param {{ ctx: any, declared: ReturnType<typeof declaredTokens>, hexes: Map<string, Set<string>>, findingRefs: Map<string, number>, problems: Array<{ code: string, message: string }> }} state
 */
function checkEntryValues(entry, where, mark, state) {
	const { ctx, declared, hexes, findingRefs, problems } = state;
	/**
	 * @param {string} key
	 * @returns {boolean} whether the field is a non-empty string (reported once if not)
	 */
	const text = (key) => {
		if (isNonEmptyString(entry[key])) return true;
		problems.push(
			problem("bad-type", `${where} ${key} must be a non-empty string`, mark),
		);
		return false;
	};

	text("name");
	if (Object.hasOwn(entry, "spec") && text("spec")) {
		if (!ctx.specIds.includes(entry["spec"])) {
			problems.push(
				problem(
					"unknown-spec-id",
					`${where} spec ${entry["spec"]} is not an id in ui-spec.json`,
					mark,
				),
			);
		}
	}
	const aliasGiven = Object.hasOwn(entry, "aliasOf")
		? entry["aliasOf"]
		: undefined;
	const aliasShapeOk = !Object.hasOwn(entry, "aliasOf") || text("aliasOf");

	switch (entry["disposition"]) {
		case "adopt": {
			const brand = entry["brand"];
			if (!isPlainObject(brand)) {
				problems.push(
					problem("bad-type", `${where} brand must be an object`, mark),
				);
				break;
			}
			const shape = closedKeys(brand, ["light", "dark"], [], `${where} brand`);
			if (shape.length > 0) {
				problems.push(...shape.map((found) => ({ ...found, ...mark })));
				break;
			}
			checkBrandRef(
				brand["light"],
				`${where} brand.light`,
				mark,
				problems,
				hexes,
			);
			checkBrandRef(
				brand["dark"],
				`${where} brand.dark`,
				mark,
				problems,
				hexes,
			);
			break;
		}
		case "derive": {
			const from = entry["from"];
			if (
				!Array.isArray(from) ||
				from.length === 0 ||
				!from.every(isNonEmptyString)
			) {
				problems.push(
					problem(
						"bad-type",
						`${where} from must be a non-empty list of brand colour paths`,
						mark,
					),
				);
			} else {
				for (const path of from) {
					if (!path.startsWith(BRAND_COLOUR_PREFIX)) {
						problems.push(
							problem(
								"bad-brand-ref",
								`${where} from ${path} must be a ${BRAND_COLOUR_PREFIX} path in tokens.json`,
								mark,
							),
						);
					}
				}
			}
			text("rule");
			break;
		}
		case "propose-upstream":
			text("owner");
			text("decision");
			break;
		case "retire":
			text("reason");
			if (Object.hasOwn(entry, "finding") && text("finding")) {
				const fingerprint = entry["finding"];
				findingRefs.set(fingerprint, (findingRefs.get(fingerprint) ?? 0) + 1);
				if (!ctx.findings.some((found) => found.fingerprint === fingerprint)) {
					problems.push(
						problem(
							"unknown-finding",
							`${where} finding ${fingerprint} is not a fingerprint in docs/evidence/known-findings.json`,
							mark,
						),
					);
				}
			}
			break;
		default:
			text("reason");
	}

	// An alias carries `aliasOf` equal to the one `var(--x)` it holds in both
	// theme blocks, and nothing else carries `aliasOf` (D-17).
	const rootValue = declared.root.get(entry["name"]);
	const sameInBoth =
		rootValue !== undefined && rootValue === declared.dark.get(entry["name"]);
	const expected = sameInBoth ? ALIAS_VALUE.exec(rootValue)?.[1] : undefined;
	if (aliasShapeOk && aliasGiven !== expected) {
		problems.push(
			problem(
				"alias-mismatch",
				expected === undefined
					? `${where} aliasOf ${aliasGiven} is set, but ${entry["name"]} is not the same var(--x) in both theme blocks`
					: `${where} must carry aliasOf ${expected}: ${entry["name"]} is var(${expected}) in both theme blocks`,
				mark,
			),
		);
	}
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
		structural.push(problem("bad-type", "entries must be an array"));
	}
	if (structural.length > 0) {
		return sortProblems(structural);
	}

	/** @type {Array<{ code: string, message: string }>} */
	const problems = [];
	if (doc["brandPin"] !== ctx.brandPin) {
		problems.push(
			problem(
				"pin-mismatch",
				`brandPin must equal the brand.pin.json commit ${ctx.brandPin}`,
			),
		);
	}

	const declared = declaredTokens(ctx.tokensCss);
	const sources = { ...ctx.sources, [TOKENS_CSS_PATH]: ctx.tokensCss };
	const used = usedTokens(sources);
	const state = {
		ctx,
		declared,
		hexes: /** @type {Map<string, Set<string>>} */ (new Map()),
		findingRefs: /** @type {Map<string, number>} */ (new Map()),
		problems,
	};

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
			problems.push(
				problem(
					"bad-disposition",
					`${where} disposition must be one of ${TOKEN_DISPOSITIONS.join(", ")}`,
					mark,
				),
			);
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
		if (keyProblems.length > 0) {
			problems.push(...keyProblems.map((found) => ({ ...found, ...mark })));
			return;
		}
		checkEntryValues(entry, where, mark, state);
	});

	// Order and uniqueness (code-unit order, never locale collation).
	if (firstDescent(names)) {
		problems.push(
			problem("unsorted", "entries must be sorted by name (code unit)"),
		);
	}
	const counts = new Map();
	for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
	for (const [name, count] of [...counts].sort((a, b) =>
		compareCodeUnits(a[0], b[0]),
	)) {
		if (count > 1) {
			problems.push(
				problem(
					"duplicate-entry",
					`${name} has ${count} entries; it needs exactly one`,
					{
						id: name,
					},
				),
			);
		}
	}

	// One brand path, one hex, across this map and ui-spec.json (D-18). A hex that
	// is not an uppercase #RRGGBB was reported as bad-hex and is not compared.
	for (const [token, hex] of Object.entries(ctx.specTokenHexes)) {
		const upper = hex.toUpperCase();
		if (!BRAND_HEX.test(upper)) continue;
		const seen = state.hexes.get(token) ?? new Set();
		seen.add(upper);
		state.hexes.set(token, seen);
	}
	for (const [token, seen] of [...state.hexes].sort((a, b) =>
		compareCodeUnits(a[0], b[0]),
	)) {
		if (seen.size > 1) {
			problems.push(
				problem(
					"brand-hex-inconsistent",
					`brand path ${token} has more than one hex across token_map.json and ui-spec.json: ${[...seen].sort(compareCodeUnits).join(", ")}`,
					{ id: token },
				),
			);
		}
	}

	// A sealed token-map-gap finding is referenced by exactly one entry, so a
	// defect the baseline holds cannot be orphaned from the map (D-20, T-74-10).
	for (const found of ctx.findings) {
		if (found.kind !== TOKEN_MAP_GAP_KIND) continue;
		const references = state.findingRefs.get(found.fingerprint) ?? 0;
		if (references !== 1) {
			problems.push(
				problem(
					"unreferenced-finding",
					`finding ${found.fingerprint} is referenced by ${references} token_map.json entries; it needs exactly one`,
					{ id: found.fingerprint },
				),
			);
		}
	}

	// A custom-property declaration belongs in :root or in the dark block at top
	// level, and in the dark block only if it is not theme-invariant (D-17).
	for (const found of declared.other) {
		problems.push(
			problem(
				"unknown-block",
				`tokens.css line ${found.line} declares ${found.name} inside ${found.selectors.join(" > ") || "no block"}; only :root and [data-theme="dark"] at top level may declare custom properties`,
				{ id: found.name },
			),
		);
	}
	for (const name of [...declared.dark.keys()].sort(compareCodeUnits)) {
		if (!declared.root.has(name)) {
			problems.push(
				problem(
					"theme-parity",
					`${name} is declared in the dark block but not in :root`,
					{ id: name },
				),
			);
		}
	}
	for (const name of [...declared.root.keys()].sort(compareCodeUnits)) {
		if (
			!declared.dark.has(name) &&
			!THEME_INVARIANT_PREFIXES.some((prefix) => name.startsWith(prefix))
		) {
			problems.push(
				problem(
					"theme-parity",
					`${name} is declared only in :root; a property without a theme-invariant prefix (${THEME_INVARIANT_PREFIXES.join(", ")}) needs a value in the dark block too`,
					{ id: name },
				),
			);
		}
	}

	// A name built from a template cannot be listed, so none is allowed.
	for (const file of Object.keys(sources).sort(compareCodeUnits)) {
		for (const prefix of dynamicCustomPropertyNames(
			file,
			sources[file] ?? "",
		)) {
			problems.push(
				problem(
					"dynamic-token-name",
					`${file} builds a custom-property name from a template (it starts ${prefix}); write the name out so token_map.json can list it`,
					{ id: file },
				),
			);
		}
	}

	// Every custom property declared in tokens.css or used under src/renderer has
	// exactly one entry, and an entry names a property that is one or the other.
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
