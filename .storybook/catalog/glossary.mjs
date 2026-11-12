// Glossary validator, loader and Markdown renderer (LANG-01, D-06).
//
// glossary.json is the authored source; GLOSSARY.md is generated from it by
// catalog.mjs. The validator is pure: everything it reads from disk comes in
// through `ctx`. Structure is checked before values, so one defect yields one
// code; the problem list is sorted by code, id, message.
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
	WORD_WAIVER_CLASSES,
} from "./vocab.mjs";

export const GLOSSARY_PATH = ".storybook/catalog/glossary.json";
export const GLOSSARY_MD_PATH = ".storybook/catalog/GLOSSARY.md";

// Every code validateGlossary can return. glossary.test.ts keeps one mutant
// per code, so a new rule needs a mutant.
export const GLOSSARY_CODES = Object.freeze([
	"avoid-is-form",
	"avoid-shared",
	"bad-avoid",
	"bad-date",
	"bad-definition",
	"bad-form",
	"bad-function-word",
	"bad-id",
	"bad-internal",
	"bad-label",
	"bad-status",
	"bad-surface",
	"bad-type",
	"bad-word-waiver",
	"duplicate-form",
	"duplicate-id",
	"duplicate-internal",
	"duplicate-label",
	"internal-missing",
	"missing-field",
	"missing-surface",
	"not-object",
	"os-surface-status",
	"reserved-now-in-en",
	"schema-version",
	"surface-file-missing",
	"surface-key-missing",
	"surface-label-missing",
	"unknown-field",
	"unsorted",
]);

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
const WAIVER_KEYS = ["word", "class", "reason"];

const MAX_DEFINITION_CHARS = 220;
const MAX_DEFINITION_SENTENCES = 2;

const WORD = /^\p{Ll}+$/u;
const PHRASE = /^\p{Ll}+( \p{Ll}+)*$/u;

// Label containment and word matching compare UTF-16 code units after mapping
// the curly apostrophes to U+0027, U+00A0 to a space and
// String.prototype.toLowerCase(). No Unicode normalization is applied.
/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
	return text.replace(/[‘’]/g, "'").replace(/ /g, " ").toLowerCase();
}

function wordsOf(text) {
	return (
		normalizeText(text.replace(/\{[^}]*\}/g, " ")).match(
			/[\p{L}][\p{L}']*/gu,
		) ?? []
	);
}

function sentenceCount(text) {
	return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
}

function isStringArray(value) {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function firstDescent(items) {
	for (let index = 1; index < items.length; index += 1) {
		if (items[index - 1] > items[index]) return true;
	}
	return false;
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
	for (const key of ["terms", "functionWords", "wordWaivers"]) {
		if (Object.hasOwn(doc, key) && !Array.isArray(doc[key])) {
			structural.push(problem("bad-type", `${key} must be an array`));
		}
	}
	if (structural.length > 0) {
		return sortProblems(structural);
	}

	const problems = [];
	/** @type {unknown[]} */
	const terms = doc["terms"];
	const enValues = Object.values(ctx.en);
	const enWords = new Set(enValues.flatMap((value) => wordsOf(value)));
	const enText = enValues.map((value) => normalizeText(value));

	// Pass 1: structure and per-term values, collecting cross-term owners.
	const ids = new Set();
	const labels = new Set();
	const formOwner = new Map();
	const avoidOwner = new Map();
	const internalOwner = new Map();
	const valid = [];
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
		const id = typeof term["id"] === "string" ? term["id"] : `terms[${index}]`;
		const mark = { id };
		const where = `term ${id}`;
		valid.push({ term, id, mark, where });
	});

	for (const { term, id, mark, where } of valid) {
		if (typeof term["id"] !== "string" || !TERM_ID_PATTERN.test(term["id"])) {
			problems.push(
				problem("bad-id", `${where} id must be a kebab slug`, mark),
			);
		} else if (ids.has(term["id"])) {
			problems.push(problem("duplicate-id", `${where} id is not unique`, mark));
		} else {
			ids.add(term["id"]);
		}

		const label = term["ui_label"];
		if (!isNonEmptyString(label)) {
			problems.push(
				problem("bad-label", `${where} ui_label must be non-empty`, mark),
			);
		} else {
			const key = normalizeText(label);
			if (labels.has(key)) {
				problems.push(
					problem(
						"duplicate-label",
						`${where} ui_label duplicates another term case-insensitively`,
						mark,
					),
				);
			}
			labels.add(key);
		}

		const definition = term["definition"];
		if (
			!isNonEmptyString(definition) ||
			definition.length > MAX_DEFINITION_CHARS ||
			sentenceCount(definition) > MAX_DEFINITION_SENTENCES
		) {
			problems.push(
				problem(
					"bad-definition",
					`${where} definition must be non-empty, at most ${MAX_DEFINITION_SENTENCES} sentences and ${MAX_DEFINITION_CHARS} characters`,
					mark,
				),
			);
		}

		if ("notes" in term && typeof term["notes"] !== "string") {
			problems.push(
				problem("bad-type", `${where} notes must be a string`, mark),
			);
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

		for (const field of ["forms", "internal", "avoid", "surfaces"]) {
			if (!isStringArray(term[field])) {
				problems.push(
					problem(
						"bad-type",
						`${where} ${field} must be an array of strings`,
						mark,
					),
				);
			}
		}

		if (isStringArray(term["forms"])) {
			for (const form of term["forms"]) {
				if (!WORD.test(form)) {
					problems.push(
						problem(
							"bad-form",
							`${where} form "${form}" must be one lowercase word`,
							mark,
						),
					);
				} else if (formOwner.has(form)) {
					problems.push(
						problem(
							"duplicate-form",
							`${where} form "${form}" is already a form of ${formOwner.get(form)}`,
							mark,
						),
					);
				} else {
					formOwner.set(form, id);
				}
			}
		}
	}

	// Pass 2: rules that need every term's forms.
	for (const { term, id, mark, where } of valid) {
		const status = term["status"];
		const label = term["ui_label"];

		if (isStringArray(term["avoid"])) {
			for (const word of term["avoid"]) {
				if (!PHRASE.test(word)) {
					problems.push(
						problem(
							"bad-avoid",
							`${where} avoid "${word}" must be lowercase words`,
							mark,
						),
					);
					continue;
				}
				if (formOwner.has(word)) {
					problems.push(
						problem(
							"avoid-is-form",
							`${where} avoid "${word}" is a form of ${formOwner.get(word)}`,
							mark,
						),
					);
				}
				if (avoidOwner.has(word)) {
					problems.push(
						problem(
							"avoid-shared",
							`${where} avoid "${word}" is already avoided by ${avoidOwner.get(word)}`,
							mark,
						),
					);
				} else {
					avoidOwner.set(word, id);
				}
			}
		}

		if (isStringArray(term["internal"])) {
			for (const internal of term["internal"]) {
				if (!isNonEmptyString(internal)) {
					problems.push(
						problem(
							"bad-internal",
							`${where} internal must be non-empty`,
							mark,
						),
					);
					continue;
				}
				const identifier = internal.split(":")[0] ?? "";
				if (!ctx.internalExists(identifier)) {
					problems.push(
						problem(
							"internal-missing",
							`${where} internal "${internal}" occurs in no filtered tree`,
							mark,
						),
					);
				}
				if (internalOwner.has(internal)) {
					problems.push(
						problem(
							"duplicate-internal",
							`${where} internal "${internal}" already belongs to ${internalOwner.get(internal)}`,
							mark,
						),
					);
				} else {
					internalOwner.set(internal, id);
				}
			}
		}

		const known =
			typeof status === "string" && GLOSSARY_STATUSES.includes(status);
		const surfaces = term["surfaces"];
		if (isStringArray(surfaces)) {
			if (surfaces.length === 0 && status !== "reserved") {
				problems.push(
					problem(
						"missing-surface",
						`${where} needs at least one surface`,
						mark,
					),
				);
			}
			for (const surface of surfaces) {
				checkSurface({
					surface,
					status,
					known,
					label,
					where,
					mark,
					ctx,
					problems,
				});
			}
		}

		if (
			status === "reserved" &&
			isNonEmptyString(label) &&
			isStringArray(term["forms"])
		) {
			const normalizedLabel = normalizeText(label);
			const inEn =
				enText.some((value) => value.includes(normalizedLabel)) ||
				term["forms"].some((form) => enWords.has(form));
			if (inEn) {
				problems.push(
					problem(
						"reserved-now-in-en",
						`${where} is reserved but its label or a form already appears in en.json; make it current with a surface`,
						mark,
					),
				);
			}
		}
	}

	checkWordLists(doc, problems);

	const termIds = valid
		.map(({ term }) => term["id"])
		.filter((value) => typeof value === "string");
	if (firstDescent(termIds)) {
		problems.push(
			problem("unsorted", "terms must be sorted by id (code unit)"),
		);
	}
	return sortProblems(problems);
}

function checkSurface({
	surface,
	status,
	known,
	label,
	where,
	mark,
	ctx,
	problems,
}) {
	const prefix = SURFACE_PREFIXES.find((candidate) =>
		surface.startsWith(candidate),
	);
	if (prefix === undefined) {
		problems.push(
			problem(
				"bad-surface",
				`${where} surface "${surface}" has no known prefix`,
				mark,
			),
		);
		return;
	}
	const rest = surface.slice(prefix.length);
	if (prefix === "os:") {
		if (rest.trim() === "") {
			problems.push(
				problem(
					"bad-surface",
					`${where} surface "${surface}" has no text`,
					mark,
				),
			);
		} else if (known && status !== "os-owned" && status !== "technical") {
			problems.push(
				problem(
					"os-surface-status",
					`${where} uses an os: surface but is ${status}; only os-owned or technical terms may`,
					mark,
				),
			);
		}
		return;
	}
	let text;
	if (prefix === "en:") {
		text = ctx.en[rest];
		if (text === undefined) {
			problems.push(
				problem(
					"surface-key-missing",
					`${where} surface ${surface} names no en.json key`,
					mark,
				),
			);
			return;
		}
	} else {
		if (resolveInRoot(".", rest) === null) {
			problems.push(
				problem(
					"bad-surface",
					`${where} surface ${surface} is not a repo-relative path`,
					mark,
				),
			);
			return;
		}
		text = ctx.readText(rest);
		if (text === null) {
			problems.push(
				problem(
					"surface-file-missing",
					`${where} surface ${surface} does not exist`,
					mark,
				),
			);
			return;
		}
	}
	if (
		isNonEmptyString(label) &&
		!normalizeText(text).includes(normalizeText(label))
	) {
		problems.push(
			problem(
				"surface-label-missing",
				`${where} surface ${surface} does not contain "${label}"`,
				mark,
			),
		);
	}
}

function checkWordLists(doc, problems) {
	const functionWords = doc["functionWords"];
	const seenWords = new Set();
	for (const word of functionWords) {
		if (typeof word !== "string" || !WORD.test(word) || seenWords.has(word)) {
			problems.push(
				problem(
					"bad-function-word",
					`functionWords entry ${JSON.stringify(word)} must be one unique lowercase word`,
				),
			);
		}
		seenWords.add(word);
	}
	if (
		functionWords.every((word) => typeof word === "string") &&
		firstDescent(functionWords)
	) {
		problems.push(
			problem("unsorted", "functionWords must be sorted (code unit)"),
		);
	}

	const waivers = doc["wordWaivers"];
	const seenWaivers = new Set();
	for (const waiver of waivers) {
		const keys = isPlainObject(waiver) ? Object.keys(waiver) : [];
		const wellFormed =
			isPlainObject(waiver) &&
			keys.length === WAIVER_KEYS.length &&
			WAIVER_KEYS.every((key) => keys.includes(key)) &&
			typeof waiver["word"] === "string" &&
			WORD.test(waiver["word"]) &&
			!seenWaivers.has(waiver["word"]) &&
			WORD_WAIVER_CLASSES.includes(waiver["class"]) &&
			isNonEmptyString(waiver["reason"]);
		if (!wellFormed) {
			problems.push(
				problem(
					"bad-word-waiver",
					`wordWaivers entry ${JSON.stringify(waiver)} must be { word, class, reason } with one unique lowercase word, a known class and a reason`,
				),
			);
		}
		if (isPlainObject(waiver) && typeof waiver["word"] === "string") {
			seenWaivers.add(waiver["word"]);
		}
	}
	const waiverWords = waivers
		.map((waiver) => (isPlainObject(waiver) ? waiver["word"] : undefined))
		.filter((word) => typeof word === "string");
	if (firstDescent(waiverWords)) {
		problems.push(
			problem("unsorted", "wordWaivers must be sorted by word (code unit)"),
		);
	}
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
