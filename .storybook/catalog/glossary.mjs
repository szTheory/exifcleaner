// Glossary validator, loader and Markdown renderer (LANG-01, D-06).
//
// glossary.json is the authored source; GLOSSARY.md is generated from it by
// catalog.mjs. The validator is pure: everything it reads from disk comes in
// through `ctx`.
import fs from "node:fs";
import path from "node:path";
import {
	closedKeys,
	compareCodeUnits,
	isCalendarDate,
	isNonEmptyString,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
} from "./closed.mjs";
import {
	FILTERED_TREES,
	GLOSSARY_STATUSES,
	SURFACE_PREFIXES,
	TERM_ID_PATTERN,
} from "./vocab.mjs";

export const GLOSSARY_PATH = ".storybook/catalog/glossary.json";
export const GLOSSARY_MD_PATH = ".storybook/catalog/GLOSSARY.md";

const TOP_REQUIRED = ["schemaVersion", "functionWords", "terms", "wordWaivers"];
const TERM_REQUIRED = [
	"id",
	"ui_label",
	"definition",
	"forms",
	"internal",
	"avoid",
	"surfaces",
	"status",
	"reviewed",
];
const TERM_OPTIONAL = ["notes"];

// Label containment compares UTF-16 code units after mapping the curly
// apostrophes to U+0027, U+00A0 to a space and String.prototype.toLowerCase().
// No Unicode normalization is applied.
export function normalizeText(text) {
	return text.replace(/[‘’]/g, "'").replace(/ /g, " ").toLowerCase();
}

function termLabel(term, index) {
	return typeof term.id === "string" ? term.id : `terms[${index}]`;
}

/**
 * @param {unknown} doc
 * @param {{ en: Record<string, string>, readText: (relPath: string) => string | null, internalExists: (identifier: string) => boolean }} ctx
 */
export function validateGlossary(doc, ctx) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "glossary must be a JSON object")];
	}
	const structural = closedKeys(doc, TOP_REQUIRED, [], "glossary");
	if (doc["schemaVersion"] !== 1) {
		structural.push(problem("schema-version", "schemaVersion must be 1"));
	}
	if (!Array.isArray(doc["terms"])) {
		structural.push(problem("bad-type", "terms must be an array"));
	}
	if (structural.length > 0) {
		return sortProblems(structural);
	}

	const problems = [];
	const seenIds = new Set();
	const seenLabels = new Set();
	/** @type {unknown[]} */
	const terms = doc["terms"];
	terms.forEach((term, index) => {
		if (!isPlainObject(term)) {
			problems.push(problem("not-object", `terms[${index}] must be an object`));
			return;
		}
		const keyProblems = closedKeys(
			term,
			TERM_REQUIRED,
			TERM_OPTIONAL,
			`terms[${index}]`,
		);
		if (keyProblems.length > 0) {
			problems.push(...keyProblems);
			return;
		}
		const id = termLabel(term, index);
		const where = `term ${id}`;
		const mark = { id };

		if (typeof term["id"] !== "string" || !TERM_ID_PATTERN.test(term["id"])) {
			problems.push(
				problem("bad-id", `${where} id must be a kebab slug`, mark),
			);
		} else if (seenIds.has(term["id"])) {
			problems.push(problem("duplicate-id", `${where} id is not unique`, mark));
		} else {
			seenIds.add(term["id"]);
		}

		const label = term["ui_label"];
		if (!isNonEmptyString(label)) {
			problems.push(
				problem("bad-label", `${where} ui_label must be non-empty`, mark),
			);
		} else {
			const key = normalizeText(label);
			if (seenLabels.has(key)) {
				problems.push(
					problem(
						"duplicate-label",
						`${where} ui_label duplicates another term case-insensitively`,
						mark,
					),
				);
			}
			seenLabels.add(key);
		}

		const status = term["status"];
		if (typeof status !== "string" || !GLOSSARY_STATUSES.includes(status)) {
			problems.push(
				problem(
					"bad-status",
					`${where} status must be one of ${GLOSSARY_STATUSES.join(", ")}`,
					mark,
				),
			);
		}

		if (!isCalendarDate(term["reviewed"])) {
			problems.push(
				problem("bad-date", `${where} reviewed must be a calendar date`, mark),
			);
		}

		const surfaces = term["surfaces"];
		if (Array.isArray(surfaces) && isNonEmptyString(label)) {
			for (const surface of surfaces) {
				if (typeof surface !== "string" || !surface.startsWith("en:")) {
					continue;
				}
				const value = ctx.en[surface.slice(3)];
				if (value === undefined) {
					problems.push(
						problem(
							"surface-key-missing",
							`${where} surface ${surface} names no en.json key`,
							mark,
						),
					);
				} else if (!normalizeText(value).includes(normalizeText(label))) {
					problems.push(
						problem(
							"surface-label-missing",
							`${where} surface ${surface} does not contain "${label}"`,
							mark,
						),
					);
				}
			}
		}
	});
	return sortProblems(problems);
}

function walkFiles(root, relPath, out) {
	const absolute = path.join(root, relPath);
	if (!fs.existsSync(absolute)) return;
	const stat = fs.statSync(absolute);
	if (stat.isFile()) {
		out.push(absolute);
		return;
	}
	for (const entry of fs.readdirSync(absolute).sort(compareCodeUnits)) {
		walkFiles(root, `${relPath}/${entry}`, out);
	}
}

/**
 * Builds the validator context from disk. Every path comes from `root`.
 *
 * @param {string} root
 */
export function loadGlossaryContext(root) {
	const en = readJson(root, ".resources/locales/en.json");
	let corpus = null;
	return {
		en,
		readText(relPath) {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return null;
			try {
				return fs.readFileSync(resolved, "utf8");
			} catch {
				return null;
			}
		},
		internalExists(identifier) {
			if (corpus === null) {
				const files = [];
				for (const tree of FILTERED_TREES) walkFiles(root, tree, files);
				corpus = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
			}
			const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(
				corpus,
			);
		},
	};
}

const GROUPS = [
	["In the product", ["canonical", "proposed", "deprecated", "reserved"]],
	["Technical detail only", ["technical"]],
	["Owned by the OS", ["os-owned"]],
];

function cell(text) {
	return text.replace(/\|/g, "\\|");
}

/**
 * @param {{ terms: Array<Record<string, any>> }} doc
 * @returns {string}
 */
export function renderGlossary(doc) {
	const lines = [
		"<!-- Generated from glossary.json by .storybook/catalog/catalog.mjs. Do not edit: edit glossary.json and run yarn catalog:write. -->",
		"",
		"# Glossary",
		"",
	];
	for (const [heading, statuses] of GROUPS) {
		const members = doc.terms
			.filter((term) => statuses.includes(term.status))
			.sort((a, b) => compareCodeUnits(a.id, b.id));
		if (members.length === 0) continue;
		lines.push(`## ${heading}`, "");
		for (const term of members) {
			const reserved = term.status === "reserved" ? " (reserved)" : "";
			lines.push(`**${term.ui_label}**${reserved}:`, term.definition);
			if (term.avoid.length > 0) {
				lines.push(`_Avoid_: ${term.avoid.join(", ")}`);
			}
			lines.push("");
		}
	}
	lines.push(
		"## Internal term to UI label",
		"",
		"| internal | ui_label | avoid | surfaces | status | reviewed |",
		"| --- | --- | --- | --- | --- | --- |",
	);
	const rows = [];
	for (const term of doc.terms) {
		for (const internal of term.internal) {
			rows.push([internal, term]);
		}
	}
	rows.sort((a, b) => compareCodeUnits(a[0], b[0]));
	for (const [internal, term] of rows) {
		lines.push(
			`| ${cell(internal)} | ${cell(term.ui_label)} | ${cell(term.avoid.join(", "))} | ${cell(term.surfaces.join(", "))} | ${term.status} | ${term.reviewed} |`,
		);
	}
	return `${lines.join("\n")}\n`;
}
