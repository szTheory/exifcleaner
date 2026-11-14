// UI-SPEC validator, loader and Markdown renderer (SPEC-01, D-27, D-28).
//
// ui-spec.json is the authored source; UI-SPEC.md is generated from it by
// catalog.mjs. The validator is pure and cache-free: everything it reads from
// disk comes in through `ctx` (the brand pin commit), and nothing here reads
// .brand-cache. Resolving a brand quote or a token path against the pinned
// brand belongs to the on-demand brand_quote_check.mjs, which is never imported
// by catalog.mjs and never runs in CI (Phase 71 D-09). Structure is checked
// before values, so one defect yields one code; the problem list is sorted by
// code, id, message.
import {
	closedKeys,
	isNonEmptyString,
	isPlainObject,
	problem,
	readJson,
	sortProblems,
} from "./closed.mjs";
import {
	UI_SPEC_BASES,
	UI_SPEC_SECTIONS,
	UI_SPEC_STATES,
	UI_SPEC_THEMES,
} from "./vocab.mjs";

export const UI_SPEC_PATH = ".storybook/catalog/ui-spec.json";
export const UI_SPEC_MD_PATH = ".storybook/catalog/UI-SPEC.md";

// Every code validateUiSpec can return. ui_spec.test.ts keeps one mutant per
// code, so a new rule needs a mutant.
export const UI_SPEC_CODES = Object.freeze([
	"bad-basis",
	"bad-cell",
	"bad-id",
	"bad-source",
	"bad-state",
	"bad-theme",
	"bad-type",
	"duplicate-cell",
	"duplicate-id",
	"empty-section",
	"empty-value",
	"missing-cell",
	"missing-field",
	"not-object",
	"pin-mismatch",
	"placeholder-value",
	"quote-missing-value",
	"schema-version",
	"source-count",
	"tokens-not-colour",
	"tokens-value-mismatch",
	"unknown-component",
	"unknown-field",
	"unsorted",
]);

const TOP_REQUIRED = ["schemaVersion", "brandPin", ...UI_SPEC_SECTIONS];
const VALUE_REQUIRED = ["id", "value"];
// A value carries exactly one of these (D-28). Which key it is says where the
// value comes from: the brand tokens, a brand quote, or an app decision.
const SOURCE_KEYS = ["tokens", "brand", "app"];
// The closed key set of each source kind. Both fields are non-empty strings.
const SOURCE_FIELDS = {
	tokens: ["path", "value"],
	brand: ["section", "quote"],
	app: ["basis", "reason"],
};
const STATES_REQUIRED = ["components", "cells"];
const CELL_REQUIRED = ["component", "state", "theme"];
const CELL_OPTIONAL = ["value", "na", ...SOURCE_KEYS];

// The cache-free tier cannot read tokens.json, so a `tokens` source is limited
// to a colour: a `color.` path and the uppercase #RRGGBB the brand file holds.
// Font and motion values cite a BRAND.md quote or an app reason instead
// (the pinned tokens.json motion block is "a brand character reference").
const COLOUR_PATH_PREFIX = "color.";
const HEX_COLOUR = /^#[0-9A-F]{6}$/;
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDERS = new Set(["tbd", "todo", "fixme", "?", "-"]);
const PLACEHOLDER_WORD = /\b(?:tbd|todo)\b/i;

/**
 * @param {Record<string, unknown>} holder
 * @returns {string[]} the source keys the holder carries
 */
function sourceKeysOf(holder) {
	return SOURCE_KEYS.filter((key) => Object.hasOwn(holder, key));
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
 * `darkRinse` -> `dark-rinse`: the id prefix of a section.
 *
 * @param {string} section
 * @returns {string}
 */
function idPrefix(section) {
	return section.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isPlaceholder(text) {
	const trimmed = text.trim();
	return (
		PLACEHOLDERS.has(trimmed.toLowerCase()) || PLACEHOLDER_WORD.test(trimmed)
	);
}

/**
 * The shape of the states section: an object with `components` and `cells`
 * arrays. A malformed one stops the value checks, as the other sections do.
 *
 * @param {unknown} states
 */
function statesStructure(states) {
	if (!isPlainObject(states)) {
		return [problem("bad-type", "states must be an object")];
	}
	const found = closedKeys(states, STATES_REQUIRED, [], "states");
	for (const key of STATES_REQUIRED) {
		if (Object.hasOwn(states, key) && !Array.isArray(states[key])) {
			found.push(problem("bad-type", `states.${key} must be an array`));
		}
	}
	return found;
}

/**
 * The one source of a value or a states cell. A defect in the source's own
 * shape is `bad-source` whatever its kind, so one defect yields one code; a
 * value that is empty or a placeholder is reported once and not checked against
 * its source as well.
 *
 * @param {Record<string, unknown>} entry
 * @param {string} where
 * @param {{ id: string }} mark
 * @param {Array<{ code: string, message: string }>} problems
 */
function checkSourced(entry, where, mark, problems) {
	const value = entry["value"];
	/** @type {string | null} */
	let text = null;
	if (!isNonEmptyString(value)) {
		problems.push(
			problem("empty-value", `${where} value must be a non-empty string`, mark),
		);
	} else if (isPlaceholder(value)) {
		problems.push(
			problem("placeholder-value", `${where} value is a placeholder`, mark),
		);
	} else {
		text = value;
	}

	const present = sourceKeysOf(entry);
	const kind = present[0];
	if (present.length !== 1 || kind === undefined) {
		problems.push(
			problem(
				"source-count",
				`${where} must carry exactly one of ${SOURCE_KEYS.join(", ")}`,
				mark,
			),
		);
		return;
	}
	const source = entry[kind];
	const fields =
		SOURCE_FIELDS[/** @type {keyof typeof SOURCE_FIELDS} */ (kind)];
	if (!isPlainObject(source)) {
		problems.push(
			problem("bad-source", `${where} ${kind} must be an object`, mark),
		);
		return;
	}
	const keyProblems = closedKeys(source, fields, [], `${where} ${kind}`);
	const emptyFields = fields.filter(
		(field) => !isNonEmptyString(source[field]),
	);
	if (keyProblems.length > 0 || emptyFields.length > 0) {
		problems.push(
			problem(
				"bad-source",
				`${where} ${kind} must be exactly ${fields.join(" and ")}, each a non-empty string`,
				mark,
			),
		);
		return;
	}
	if (kind === "tokens") {
		const path = /** @type {string} */ (source["path"]);
		const hex = /** @type {string} */ (source["value"]);
		if (!path.startsWith(COLOUR_PATH_PREFIX) || !HEX_COLOUR.test(hex)) {
			problems.push(
				problem(
					"tokens-not-colour",
					`${where} tokens must be a ${COLOUR_PATH_PREFIX} path with an uppercase #RRGGBB value`,
					mark,
				),
			);
		}
		if (text !== null && text !== hex) {
			problems.push(
				problem(
					"tokens-value-mismatch",
					`${where} value must equal its tokens value ${hex}`,
					mark,
				),
			);
		}
	} else if (kind === "brand") {
		const quote = /** @type {string} */ (source["quote"]);
		if (text !== null && !quote.includes(text)) {
			problems.push(
				problem(
					"quote-missing-value",
					`${where} value ${JSON.stringify(text)} is not in its brand quote`,
					mark,
				),
			);
		}
	} else if (!UI_SPEC_BASES.includes(/** @type {string} */ (source["basis"]))) {
		problems.push(
			problem(
				"bad-basis",
				`${where} app basis must be one of ${UI_SPEC_BASES.join(", ")}`,
				mark,
			),
		);
	}
}

/**
 * @param {unknown} doc
 * @param {{ brandPin: string }} ctx
 */
export function validateUiSpec(doc, ctx) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "ui-spec must be a JSON object")];
	}
	const structural = closedKeys(doc, TOP_REQUIRED, [], "ui-spec");
	if (doc["schemaVersion"] !== 1) {
		structural.push(problem("schema-version", "schemaVersion must be 1"));
	}
	for (const section of UI_SPEC_SECTIONS) {
		if (!Object.hasOwn(doc, section)) continue;
		if (section === "states") {
			structural.push(...statesStructure(doc[section]));
		} else if (!Array.isArray(doc[section])) {
			structural.push(problem("bad-type", `${section} must be an array`));
		}
	}
	if (structural.length > 0) {
		return sortProblems(structural);
	}

	const problems = [];
	if (doc["brandPin"] !== ctx.brandPin) {
		problems.push(
			problem(
				"pin-mismatch",
				`brandPin must equal the brand.pin.json commit ${ctx.brandPin}`,
			),
		);
	}

	// Ids are unique across the whole document, not per section.
	const ids = new Set();
	for (const section of UI_SPEC_SECTIONS) {
		if (section === "states") continue;
		/** @type {unknown[]} */
		const values = doc[section];
		if (values.length === 0) {
			problems.push(
				problem("empty-section", `${section} must hold at least one value`),
			);
		}
		const pattern = new RegExp(
			`^${idPrefix(section)}(\\.[a-z0-9]+(-[a-z0-9]+)*)+$`,
		);
		const orderedIds = [];
		values.forEach((value, index) => {
			const where = `${section}[${index}]`;
			if (!isPlainObject(value)) {
				problems.push(problem("not-object", `${where} must be an object`));
				return;
			}
			const keyProblems = closedKeys(value, VALUE_REQUIRED, SOURCE_KEYS, where);
			if (keyProblems.length > 0) {
				problems.push(...keyProblems);
				return;
			}
			const id = typeof value["id"] === "string" ? value["id"] : where;
			const mark = { id };
			if (typeof value["id"] !== "string" || !pattern.test(value["id"])) {
				problems.push(
					problem(
						"bad-id",
						`${where} id must be ${idPrefix(section)} followed by dotted kebab segments`,
						mark,
					),
				);
			} else {
				if (ids.has(id)) {
					problems.push(
						problem("duplicate-id", `${where} id ${id} is not unique`, mark),
					);
				}
				ids.add(id);
				orderedIds.push(id);
			}
			checkSourced(value, `${section} ${id}`, mark, problems);
		});
		if (firstDescent(orderedIds)) {
			problems.push(
				problem("unsorted", `${section} must be sorted by id (code unit)`),
			);
		}
	}

	// The states matrix: component x state x theme, every cell present once.
	const states = doc["states"];
	/** @type {unknown[]} */
	const components = states["components"];
	/** @type {unknown[]} */
	const cells = states["cells"];
	if (components.length === 0) {
		problems.push(
			problem("empty-section", "states must list at least one component"),
		);
	}
	const known = new Set();
	const listed = [];
	components.forEach((name, index) => {
		if (typeof name !== "string") {
			problems.push(
				problem("bad-type", `states.components[${index}] must be a string`),
			);
			return;
		}
		const mark = { id: name };
		if (!NAME.test(name)) {
			problems.push(
				problem("bad-id", `component ${name} must be a kebab slug`, mark),
			);
		}
		if (known.has(name)) {
			problems.push(
				problem("duplicate-id", `component ${name} is listed twice`, mark),
			);
		}
		known.add(name);
		listed.push(name);
	});
	if (firstDescent(listed)) {
		problems.push(
			problem(
				"unsorted",
				"states.components must be sorted by name (code unit)",
			),
		);
	}

	const seen = new Set();
	const keys = [];
	cells.forEach((stateCell, index) => {
		const where = `states.cells[${index}]`;
		if (!isPlainObject(stateCell)) {
			problems.push(problem("not-object", `${where} must be an object`));
			return;
		}
		const keyProblems = closedKeys(
			stateCell,
			CELL_REQUIRED,
			CELL_OPTIONAL,
			where,
		);
		if (keyProblems.length > 0) {
			problems.push(...keyProblems);
			return;
		}
		const { component, state, theme } = stateCell;
		if (
			typeof component !== "string" ||
			typeof state !== "string" ||
			typeof theme !== "string"
		) {
			problems.push(
				problem(
					"bad-type",
					`${where} component, state and theme must be strings`,
				),
			);
			return;
		}
		const key = `${component}|${state}|${theme}`;
		const mark = { id: key };
		keys.push(key);
		let inMatrix = true;
		if (!known.has(component)) {
			inMatrix = false;
			problems.push(
				problem(
					"unknown-component",
					`${where} component ${component} is not in states.components`,
					mark,
				),
			);
		}
		if (!UI_SPEC_STATES.includes(state)) {
			inMatrix = false;
			problems.push(
				problem(
					"bad-state",
					`${where} state must be one of ${UI_SPEC_STATES.join(", ")}`,
					mark,
				),
			);
		}
		if (!UI_SPEC_THEMES.includes(theme)) {
			inMatrix = false;
			problems.push(
				problem(
					"bad-theme",
					`${where} theme must be one of ${UI_SPEC_THEMES.join(", ")}`,
					mark,
				),
			);
		}
		if (inMatrix) {
			if (seen.has(key)) {
				problems.push(
					problem("duplicate-cell", `${where} repeats cell ${key}`, mark),
				);
			}
			seen.add(key);
		}

		// A cell holds a value with one source, or `na` with a reason: never both,
		// never neither (D-13).
		const hasValue = Object.hasOwn(stateCell, "value");
		const hasNa = Object.hasOwn(stateCell, "na");
		if (hasValue === hasNa) {
			problems.push(
				problem(
					"bad-cell",
					`${where} must hold either a value with one source or na with a reason`,
					mark,
				),
			);
		} else if (hasNa) {
			if (!isNonEmptyString(stateCell["na"])) {
				problems.push(
					problem("bad-cell", `${where} na reason must be non-empty`, mark),
				);
			} else if (sourceKeysOf(stateCell).length > 0) {
				problems.push(
					problem("bad-cell", `${where} na cell must carry no source`, mark),
				);
			}
		} else {
			checkSourced(stateCell, where, mark, problems);
		}
	});
	if (firstDescent(keys)) {
		problems.push(
			problem(
				"unsorted",
				"states.cells must be sorted by component|state|theme (code unit)",
			),
		);
	}
	for (const component of known) {
		for (const state of UI_SPEC_STATES) {
			for (const theme of UI_SPEC_THEMES) {
				const key = `${component}|${state}|${theme}`;
				if (!seen.has(key)) {
					problems.push(
						problem("missing-cell", `states has no cell ${key}`, { id: key }),
					);
				}
			}
		}
	}

	return sortProblems(problems);
}

/**
 * Builds the validator context from disk. Only brand.pin.json is read.
 *
 * @param {string} root
 */
export function loadUiSpecContext(root) {
	const pin = /** @type {{ commit: string }} */ (
		readJson(root, "brand.pin.json")
	);
	return { brandPin: pin.commit };
}

/**
 * @param {string} text
 * @returns {string}
 */
function cell(text) {
	return String(text)
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/\|/g, "\\|");
}

/**
 * @param {Record<string, any>} entry a value or a states cell carrying one source
 * @returns {string}
 */
function describeSource(entry) {
	if (isPlainObject(entry["tokens"])) {
		return `tokens ${entry["tokens"]["path"]}`;
	}
	if (isPlainObject(entry["brand"])) {
		return `brand ${entry["brand"]["section"]}: ${entry["brand"]["quote"]}`;
	}
	return `app (${entry["app"]["basis"]}): ${entry["app"]["reason"]}`;
}

/**
 * Counts values by source kind, and `app` values by basis, over the section
 * values and the states cells that carry a value (D-28: an app decision must
 * not read as brand-derived).
 *
 * @param {Record<string, any>} doc
 */
function countSources(doc) {
	const kinds = { tokens: 0, brand: 0, app: 0 };
	/** @type {Record<string, number>} */
	const bases = Object.fromEntries(UI_SPEC_BASES.map((basis) => [basis, 0]));
	const entries = [];
	for (const section of UI_SPEC_SECTIONS) {
		if (section !== "states") entries.push(...doc[section]);
	}
	let notApplicable = 0;
	for (const stateCell of doc["states"].cells) {
		if (Object.hasOwn(stateCell, "na")) notApplicable += 1;
		else entries.push(stateCell);
	}
	for (const entry of entries) {
		if (isPlainObject(entry["tokens"])) kinds.tokens += 1;
		else if (isPlainObject(entry["brand"])) kinds.brand += 1;
		else {
			kinds.app += 1;
			bases[entry["app"]["basis"]] = (bases[entry["app"]["basis"]] ?? 0) + 1;
		}
	}
	return { total: entries.length, kinds, bases, notApplicable };
}

/**
 * @param {Record<string, any>} doc
 * @returns {string}
 */
export function renderUiSpec(doc) {
	const counts = countSources(doc);
	const basisText = UI_SPEC_BASES.map(
		(basis) => `${basis} ${counts.bases[basis] ?? 0}`,
	).join(", ");
	const lines = [
		"<!-- Generated from ui-spec.json by .storybook/catalog/catalog.mjs. Do not edit: edit ui-spec.json and run yarn catalog:write. -->",
		"",
		"# UI-SPEC",
		"",
		`Brand pin: \`${doc["brandPin"]}\``,
		"",
		`Sources: ${counts.total} values: tokens ${counts.kinds.tokens}, brand ${counts.kinds.brand}, app ${counts.kinds.app} (${basisText}); ${counts.notApplicable} states cells n/a. Each value names exactly one source; an app value is an app decision, not brand text.`,
		"",
	];
	for (const section of UI_SPEC_SECTIONS) {
		lines.push(`## ${section}`, "");
		if (section === "states") {
			const { components, cells } = doc["states"];
			lines.push(`Components: ${components.map(cell).join(", ")}`, "");
			for (const theme of UI_SPEC_THEMES) {
				lines.push(
					`### ${theme}`,
					"",
					`| Component | ${UI_SPEC_STATES.join(" | ")} |`,
					`| --- | ${UI_SPEC_STATES.map(() => "---").join(" | ")} |`,
				);
				for (const component of components) {
					const row = UI_SPEC_STATES.map((state) => {
						const found = cells.find(
							(/** @type {Record<string, any>} */ candidate) =>
								candidate["component"] === component &&
								candidate["state"] === state &&
								candidate["theme"] === theme,
						);
						if (found === undefined) return "";
						return Object.hasOwn(found, "na")
							? cell(`n/a: ${found["na"]}`)
							: cell(found["value"]);
					});
					lines.push(`| ${cell(component)} | ${row.join(" | ")} |`);
				}
				lines.push("");
			}
			lines.push(
				"### cell sources",
				"",
				"| Component | State | Theme | Source |",
				"| --- | --- | --- | --- |",
			);
			for (const stateCell of cells) {
				if (Object.hasOwn(stateCell, "na")) continue;
				lines.push(
					`| ${cell(stateCell["component"])} | ${stateCell["state"]} | ${stateCell["theme"]} | ${cell(describeSource(stateCell))} |`,
				);
			}
			lines.push("");
			continue;
		}
		lines.push("| Id | Value | Source |", "| --- | --- | --- |");
		for (const value of doc[section]) {
			lines.push(
				`| ${cell(value["id"])} | ${cell(value["value"])} | ${cell(describeSource(value))} |`,
			);
		}
		lines.push("");
	}
	return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
