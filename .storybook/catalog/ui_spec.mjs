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
	"missing-field",
	"not-object",
	"pin-mismatch",
	"schema-version",
	"source-count",
	"unknown-field",
]);

const TOP_REQUIRED = ["schemaVersion", "brandPin", ...UI_SPEC_SECTIONS];
const VALUE_REQUIRED = ["id", "value"];
// A value carries exactly one of these (D-28). Which key it is says where the
// value comes from: the brand tokens, a brand quote, or an app decision.
const SOURCE_KEYS = ["tokens", "brand", "app"];
const STATES_REQUIRED = ["components", "cells"];
const CELL_REQUIRED = ["component", "state", "theme"];
const CELL_OPTIONAL = ["value", "na", ...SOURCE_KEYS];

/**
 * @param {Record<string, unknown>} holder
 * @returns {string[]} the source keys the holder carries
 */
function sourceKeysOf(holder) {
	return SOURCE_KEYS.filter((key) => Object.hasOwn(holder, key));
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

	for (const section of UI_SPEC_SECTIONS) {
		if (section === "states") continue;
		const values = doc[section];
		if (!Array.isArray(values)) continue;
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
			if (sourceKeysOf(value).length !== 1) {
				problems.push(
					problem(
						"source-count",
						`${where} must carry exactly one of ${SOURCE_KEYS.join(", ")}`,
						{ id },
					),
				);
			}
		});
	}

	const states = doc["states"];
	if (!isPlainObject(states)) {
		problems.push(problem("not-object", "states must be an object"));
	} else {
		const stateProblems = closedKeys(states, STATES_REQUIRED, [], "states");
		problems.push(...stateProblems);
		const cells = states["cells"];
		if (stateProblems.length === 0 && Array.isArray(cells)) {
			cells.forEach((cell, index) => {
				const where = `states.cells[${index}]`;
				if (!isPlainObject(cell)) {
					problems.push(problem("not-object", `${where} must be an object`));
					return;
				}
				const keyProblems = closedKeys(
					cell,
					CELL_REQUIRED,
					CELL_OPTIONAL,
					where,
				);
				if (keyProblems.length > 0) {
					problems.push(...keyProblems);
					return;
				}
				if (Object.hasOwn(cell, "value") && sourceKeysOf(cell).length !== 1) {
					problems.push(
						problem(
							"source-count",
							`${where} must carry exactly one of ${SOURCE_KEYS.join(", ")}`,
							{ id: where },
						),
					);
				}
			});
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
