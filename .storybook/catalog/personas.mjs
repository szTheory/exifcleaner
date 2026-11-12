// Persona and jobs catalog: validator, loader and Markdown renderer
// (JTBD-01, D-15 to D-18).
//
// catalog.json is the authored source; PERSONAS.md is generated from it by
// catalog.mjs. The validator is pure: everything it reads from disk comes in
// through `ctx`. Structure is checked before values, so one planted defect
// yields one code; the problem list is sorted by code, id, message.
//
// Privacy: every record is closed, so there is no field where a name, age,
// occupation, bio, quote or photo could go. Issues are cited by number only.
import fs from "node:fs";
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
import { buildRuleset } from "./copy_lint.mjs";
import {
	CLAIM_ABOUT,
	CLAIM_TAGS,
	JOB_ID_PATTERN,
	PERSONA_IDS,
	RED_FLAG_ID_PATTERN,
	RED_FLAG_KINDS,
	SOURCE_KINDS,
	STATE_CLASSES,
	VALIDATE_BY,
} from "./vocab.mjs";

export const CATALOG_PATH = ".storybook/catalog/catalog.json";
export const PERSONAS_MD_PATH = ".storybook/catalog/PERSONAS.md";

const COPY_LINT_RULES_PATH = ".storybook/catalog/copy_lint_rules.json";
const GLOSSARY_PATH = ".storybook/catalog/glossary.json";

// Every code validateCatalog can return. personas.test.ts keeps one mutant per
// code, so a new rule needs a mutant.
export const CATALOG_CODES = Object.freeze([
	"bad-about",
	"bad-date",
	"bad-field",
	"bad-id",
	"bad-red-flag-kind",
	"bad-source",
	"bad-state",
	"bad-tag",
	"bad-type",
	"bad-validate-by",
	"duplicate-id",
	"duplicate-ref",
	"missing-field",
	"not-object",
	"persona-list",
	"schema-version",
	"spam-ref",
	"text-too-long",
	"unknown-field",
	"unsorted",
]);

const TOP_REQUIRED = ["schemaVersion", "coreJob", "personas", "jobs"];
const CORE_REQUIRED = ["statement", "clauses"];
const PERSONA_REQUIRED = ["id", "label", "claims", "redFlags"];
const JOB_REQUIRED = ["id", "when", "want", "so", "personas", "claims"];
const CLAIM_REQUIRED = ["field", "about", "tag", "text", "source"];
const CLAIM_OPTIONAL = ["validateBy"];
const FLAG_REQUIRED = ["id", "kind", "tag", "text", "source", "states", "jobs"];
const FLAG_OPTIONAL = ["validateBy", "forbidden", "gate"];

const CORE_FIELDS = Object.freeze([
	"remove",
	"no-surprises",
	"see-changes",
	"wording",
]);
const PERSONA_FIELDS = Object.freeze(["trigger", "need", "context", "stakes"]);
const JOB_FIELDS = Object.freeze(["evidence"]);

const MAX_TEXT_UNITS = 300;
const PERSONA_ID_PATTERN = /^P-[a-z]+$/;
const ISSUE_REF_PATTERN = /^#\d+$/;
// #351 is spam and is never cited.
const SPAM_REFS = Object.freeze(["#351"]);

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

// Ids of one list: well-formed, unique. Reports `clean` so the order check is
// not stacked on top of an id defect.
function checkIds({ ids, pattern, what, problems }) {
	let clean = true;
	const seen = new Set();
	for (const id of ids) {
		if (typeof id !== "string" || !pattern.test(id)) {
			problems.push(
				problem("bad-id", `${what} id ${JSON.stringify(id)} is malformed`),
			);
			clean = false;
		} else if (seen.has(id)) {
			problems.push(
				problem("duplicate-id", `${what} id ${id} is not unique`, { id }),
			);
			clean = false;
		} else {
			seen.add(id);
		}
	}
	return clean;
}

function sourceProblems(source, where, mark) {
	if (!isPlainObject(source)) {
		return [problem("bad-source", `${where} source must be an object`, mark)];
	}
	const kind = source["kind"];
	if (typeof kind !== "string" || !SOURCE_KINDS.includes(kind)) {
		return [
			problem(
				"bad-source",
				`${where} source kind must be one of ${SOURCE_KINDS.join(", ")}`,
				mark,
			),
		];
	}
	const shapes = {
		issue: [["kind", "by", "refs"], []],
		code: [["kind", "path", "symbol"], []],
		string: [["kind", "key"], []],
		brand: [["kind", "pin", "section"], []],
		maintainer: [["kind", "date", "doc"], []],
		none: [["kind"], []],
	};
	const [required, optional] = shapes[kind];
	const problems = closedKeys(
		source,
		required,
		optional,
		`${where} source`,
	).map((found) => ({ ...found, ...mark }));
	if (problems.length > 0) return problems;
	const bad = (message) =>
		problem("bad-source", `${where} source ${message}`, mark);
	if (kind === "issue") {
		if (source["by"] !== "user" && source["by"] !== "maintainer") {
			problems.push(bad("by must be user or maintainer"));
		}
		const refs = source["refs"];
		if (
			!isStringArray(refs) ||
			refs.length === 0 ||
			!refs.every((ref) => ISSUE_REF_PATTERN.test(ref))
		) {
			problems.push(
				bad("refs must be a non-empty list of issue numbers like #405"),
			);
		} else if (refs.some((ref) => SPAM_REFS.includes(ref))) {
			problems.push(
				problem("spam-ref", `${where} source cites a spam issue`, mark),
			);
		}
	} else if (kind === "maintainer") {
		if (!isCalendarDate(source["date"])) {
			problems.push(
				problem(
					"bad-date",
					`${where} source date must be a calendar date`,
					mark,
				),
			);
		}
		if (!isNonEmptyString(source["doc"]))
			problems.push(bad("doc must be non-empty"));
	} else if (kind !== "none") {
		for (const key of required.filter((name) => name !== "kind")) {
			if (!isNonEmptyString(source[key])) {
				problems.push(bad(`${key} must be non-empty`));
			}
		}
	}
	return problems;
}

function claimShape({ claim, index, owner, fields, problems }) {
	const where = `${owner} claims[${index}]`;
	if (!isPlainObject(claim)) {
		problems.push(problem("not-object", `${where} must be an object`));
		return;
	}
	const mark = { id: owner };
	for (const found of closedKeys(
		claim,
		CLAIM_REQUIRED,
		CLAIM_OPTIONAL,
		where,
	)) {
		problems.push({ ...found, ...mark });
	}
	if (typeof claim["field"] === "string" && !fields.includes(claim["field"])) {
		problems.push(
			problem(
				"bad-field",
				`${where} field must be one of ${fields.join(", ")}`,
				mark,
			),
		);
	}
	if (Object.hasOwn(claim, "about") && !CLAIM_ABOUT.includes(claim["about"])) {
		problems.push(
			problem("bad-about", `${where} about must be user or product`, mark),
		);
	}
	if (Object.hasOwn(claim, "tag") && !CLAIM_TAGS.includes(claim["tag"])) {
		problems.push(
			problem(
				"bad-tag",
				`${where} tag must be one of ${CLAIM_TAGS.join(", ")}`,
				mark,
			),
		);
	}
	textShape({ record: claim, where, mark, problems });
	validateByShape({ record: claim, where, mark, problems });
	if (Object.hasOwn(claim, "source")) {
		problems.push(...sourceProblems(claim["source"], where, mark));
	}
}

function textShape({ record, where, mark, problems }) {
	if (!Object.hasOwn(record, "text")) return;
	if (!isNonEmptyString(record["text"])) {
		problems.push(
			problem("bad-type", `${where} text must be a non-empty string`, mark),
		);
	} else if (record["text"].length > MAX_TEXT_UNITS) {
		problems.push(
			problem(
				"text-too-long",
				`${where} text is over ${MAX_TEXT_UNITS} characters`,
				mark,
			),
		);
	}
}

function validateByShape({ record, where, mark, problems }) {
	if (
		Object.hasOwn(record, "validateBy") &&
		!VALIDATE_BY.includes(record["validateBy"])
	) {
		problems.push(
			problem(
				"bad-validate-by",
				`${where} validateBy must be one of ${VALIDATE_BY.join(", ")}`,
				mark,
			),
		);
	}
}

function claimList({ claims, owner, fields, problems }) {
	if (!Array.isArray(claims)) {
		problems.push(
			problem("bad-type", `${owner} claims must be an array`, { id: owner }),
		);
		return;
	}
	claims.forEach((claim, index) =>
		claimShape({ claim, index, owner, fields, problems }),
	);
}

function flagShape({ flag, persona, problems }) {
	const owner =
		isPlainObject(flag) && typeof flag["id"] === "string"
			? flag["id"]
			: "red flag";
	const where = `red flag ${owner}`;
	if (!isPlainObject(flag)) {
		problems.push(
			problem("not-object", `${persona} red flags must be objects`),
		);
		return;
	}
	const mark = { id: owner };
	for (const found of closedKeys(flag, FLAG_REQUIRED, FLAG_OPTIONAL, where)) {
		problems.push({ ...found, ...mark });
	}
	if (Object.hasOwn(flag, "kind") && !RED_FLAG_KINDS.includes(flag["kind"])) {
		problems.push(
			problem(
				"bad-red-flag-kind",
				`${where} kind must be one of ${RED_FLAG_KINDS.join(", ")}`,
				mark,
			),
		);
	}
	if (Object.hasOwn(flag, "tag") && !CLAIM_TAGS.includes(flag["tag"])) {
		problems.push(
			problem(
				"bad-tag",
				`${where} tag must be one of ${CLAIM_TAGS.join(", ")}`,
				mark,
			),
		);
	}
	textShape({ record: flag, where, mark, problems });
	validateByShape({ record: flag, where, mark, problems });
	if (Object.hasOwn(flag, "source")) {
		problems.push(...sourceProblems(flag["source"], where, mark));
	}
	if (Object.hasOwn(flag, "states")) {
		if (!isStringArray(flag["states"])) {
			problems.push(
				problem(
					"bad-type",
					`${where} states must be an array of strings`,
					mark,
				),
			);
		} else {
			for (const state of flag["states"]) {
				if (!STATE_CLASSES.includes(state)) {
					problems.push(
						problem(
							"bad-state",
							`${where} state ${JSON.stringify(state)} is not a state class`,
							mark,
						),
					);
				}
			}
			if (flag["kind"] === "never-happen" && flag["states"].length === 0) {
				problems.push(
					problem("bad-state", `${where} needs at least one state`, mark),
				);
			}
		}
	}
	if (Object.hasOwn(flag, "jobs") && !isStringArray(flag["jobs"])) {
		problems.push(
			problem("bad-type", `${where} jobs must be an array of strings`, mark),
		);
	}
	if (Object.hasOwn(flag, "forbidden") && !isStringArray(flag["forbidden"])) {
		problems.push(
			problem(
				"bad-type",
				`${where} forbidden must be an array of strings`,
				mark,
			),
		);
	}
	if (Object.hasOwn(flag, "gate") && !isNonEmptyString(flag["gate"])) {
		problems.push(
			problem("bad-type", `${where} gate must be a non-empty string`, mark),
		);
	}
}

function personaShape({ persona, index, problems }) {
	if (!isPlainObject(persona)) {
		problems.push(
			problem("not-object", `personas[${index}] must be an object`),
		);
		return;
	}
	const id =
		typeof persona["id"] === "string" ? persona["id"] : `personas[${index}]`;
	for (const found of closedKeys(
		persona,
		PERSONA_REQUIRED,
		[],
		`persona ${id}`,
	)) {
		problems.push({ ...found, id });
	}
	if (Object.hasOwn(persona, "label") && !isNonEmptyString(persona["label"])) {
		problems.push(
			problem("bad-type", `persona ${id} label must be non-empty`, { id }),
		);
	}
	if (Object.hasOwn(persona, "claims")) {
		claimList({
			claims: persona["claims"],
			owner: id,
			fields: PERSONA_FIELDS,
			problems,
		});
	}
	if (Object.hasOwn(persona, "redFlags")) {
		const flags = persona["redFlags"];
		if (!Array.isArray(flags)) {
			problems.push(
				problem("bad-type", `persona ${id} redFlags must be an array`, { id }),
			);
			return;
		}
		for (const flag of flags) flagShape({ flag, persona: id, problems });
		const slug = id.startsWith("P-") ? id.slice(2) : id;
		const ids = flags.map((flag) =>
			isPlainObject(flag) ? flag["id"] : undefined,
		);
		const clean = checkIds({
			ids,
			pattern: RED_FLAG_ID_PATTERN,
			what: "red flag",
			problems,
		});
		for (const flagId of ids) {
			if (
				typeof flagId === "string" &&
				RED_FLAG_ID_PATTERN.test(flagId) &&
				!flagId.startsWith(`RF-${slug}-`)
			) {
				problems.push(
					problem("bad-id", `red flag ${flagId} does not belong to ${id}`, {
						id: flagId,
					}),
				);
			}
		}
		if (clean && firstDescent(ids)) {
			problems.push(
				problem(
					"unsorted",
					`persona ${id} redFlags must be sorted by id (code unit)`,
					{ id },
				),
			);
		}
	}
}

function jobShape({ job, index, problems }) {
	if (!isPlainObject(job)) {
		problems.push(problem("not-object", `jobs[${index}] must be an object`));
		return;
	}
	const id = typeof job["id"] === "string" ? job["id"] : `jobs[${index}]`;
	for (const found of closedKeys(job, JOB_REQUIRED, [], `job ${id}`)) {
		problems.push({ ...found, id });
	}
	for (const key of ["when", "want", "so"]) {
		if (Object.hasOwn(job, key) && typeof job[key] !== "string") {
			problems.push(
				problem("bad-type", `job ${id} ${key} must be a string`, { id }),
			);
		}
	}
	if (Object.hasOwn(job, "personas")) {
		if (!isStringArray(job["personas"])) {
			problems.push(
				problem("bad-type", `job ${id} personas must be an array of strings`, {
					id,
				}),
			);
		} else if (new Set(job["personas"]).size !== job["personas"].length) {
			problems.push(
				problem("duplicate-ref", `job ${id} lists a persona twice`, { id }),
			);
		}
	}
	if (Object.hasOwn(job, "claims")) {
		claimList({
			claims: job["claims"],
			owner: id,
			fields: JOB_FIELDS,
			problems,
		});
	}
}

/**
 * The shape layer: closed keys at every level, closed vocabularies, id
 * patterns, uniqueness and order. Returns early in `validateCatalog` so a
 * value rule never stacks on a structural defect.
 *
 * @param {unknown} doc
 */
function shapeProblems(doc) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "catalog must be a JSON object")];
	}
	const problems = closedKeys(doc, TOP_REQUIRED, [], "catalog");
	if (Object.hasOwn(doc, "schemaVersion") && doc["schemaVersion"] !== 1) {
		problems.push(problem("schema-version", "schemaVersion must be 1"));
	}
	const core = doc["coreJob"];
	if (Object.hasOwn(doc, "coreJob")) {
		if (!isPlainObject(core)) {
			problems.push(problem("bad-type", "coreJob must be an object"));
		} else {
			for (const found of closedKeys(core, CORE_REQUIRED, [], "coreJob")) {
				problems.push(found);
			}
			if (
				Object.hasOwn(core, "statement") &&
				!isNonEmptyString(core["statement"])
			) {
				problems.push(
					problem("bad-type", "coreJob statement must be non-empty"),
				);
			}
			if (Object.hasOwn(core, "clauses")) {
				claimList({
					claims: core["clauses"],
					owner: "coreJob",
					fields: CORE_FIELDS,
					problems,
				});
				if (Array.isArray(core["clauses"])) {
					for (const field of CORE_FIELDS) {
						const count = core["clauses"].filter(
							(clause) => isPlainObject(clause) && clause["field"] === field,
						).length;
						if (count !== 1) {
							problems.push(
								problem(
									"missing-field",
									`coreJob needs exactly one ${field} clause`,
									{ id: "coreJob" },
								),
							);
						}
					}
				}
			}
		}
	}
	for (const key of ["personas", "jobs"]) {
		if (Object.hasOwn(doc, key) && !Array.isArray(doc[key])) {
			problems.push(problem("bad-type", `${key} must be an array`));
		}
	}
	if (Array.isArray(doc["personas"])) {
		doc["personas"].forEach((persona, index) =>
			personaShape({ persona, index, problems }),
		);
		const ids = doc["personas"].map((persona) =>
			isPlainObject(persona) ? persona["id"] : undefined,
		);
		const clean = checkIds({
			ids,
			pattern: PERSONA_ID_PATTERN,
			what: "persona",
			problems,
		});
		if (clean) {
			if (firstDescent(ids)) {
				problems.push(
					problem("unsorted", "personas must be sorted by id (code unit)"),
				);
			}
			if ([...ids].sort(compareCodeUnits).join(",") !== PERSONA_IDS.join(",")) {
				problems.push(
					problem(
						"persona-list",
						`persona ids must be exactly ${PERSONA_IDS.join(", ")}`,
					),
				);
			}
		}
	}
	if (Array.isArray(doc["jobs"])) {
		doc["jobs"].forEach((job, index) => jobShape({ job, index, problems }));
		const ids = doc["jobs"].map((job) =>
			isPlainObject(job) ? job["id"] : undefined,
		);
		const clean = checkIds({
			ids,
			pattern: JOB_ID_PATTERN,
			what: "job",
			problems,
		});
		if (clean && firstDescent(ids)) {
			problems.push(
				problem("unsorted", "jobs must be sorted by id (code unit)"),
			);
		}
	}
	return problems;
}

/**
 * @param {unknown} doc
 * @param {{ readText: (relPath: string) => string | null, enKeys: readonly string[], brandPin: string, ruleset: { rules: ReadonlyArray<any> }, glossary: unknown }} _ctx
 */
export function validateCatalog(doc, _ctx) {
	return sortProblems(shapeProblems(doc));
}

/**
 * Builds the validator context from disk. Every path comes from `root`.
 *
 * @param {string} root
 */
export function loadCatalogContext(root) {
	const en = /** @type {Record<string, string>} */ (
		readJson(root, ".resources/locales/en.json")
	);
	const pin = /** @type {{ commit: string }} */ (
		readJson(root, "brand.pin.json")
	);
	const glossary = readJson(root, GLOSSARY_PATH);
	const ruleset = buildRuleset(readJson(root, COPY_LINT_RULES_PATH), glossary);
	return {
		enKeys: Object.keys(en),
		brandPin: pin.commit,
		glossary,
		ruleset,
		readText(relPath) {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return null;
			try {
				return fs.readFileSync(resolved, "utf8");
			} catch {
				return null;
			}
		},
	};
}

/**
 * What the scenario manifest validator needs (D-23): persona and job ids, the
 * job to persona map and the red flags with their states and jobs.
 *
 * @param {string} root
 */
export function loadCatalog(root) {
	const doc = /** @type {any} */ (readJson(root, CATALOG_PATH));
	const problems = validateCatalog(doc, loadCatalogContext(root));
	if (problems.length > 0) {
		const first = problems[0];
		throw new Error(`${first?.code}: ${first?.message}`);
	}
	const jobPersonas = {};
	for (const job of doc.jobs) {
		jobPersonas[job.id] = [...job.personas];
	}
	return {
		personaIds: doc.personas.map((persona) => persona.id),
		jobIds: doc.jobs.map((job) => job.id),
		jobPersonas,
		redFlags: doc.personas.flatMap((persona) =>
			persona.redFlags.map((flag) => ({
				id: flag.id,
				persona: persona.id,
				kind: flag.kind,
				states: [...flag.states],
				jobs: [...flag.jobs],
			})),
		),
	};
}

const HEADER = [
	"GitHub issues are the only inbound channel, so every claim marked confirmed comes from a person who filed one.",
	"People file issues when something fails: confirmed over-weights failure and says nothing about prevalence, so no claim here says how many people hold it.",
	"CI checks issue sources by format only; authorship (user or maintainer) was checked once at plan time with gh api, and a moved author needs the same check again.",
];

function sourceSummary(source) {
	switch (source.kind) {
		case "issue":
			return `issues ${source.refs.join(", ")}, by ${source.by}`;
		case "code":
			return `code ${source.path}#${source.symbol}`;
		case "string":
			return `string ${source.key}`;
		case "brand":
			return `brand ${source.pin.slice(0, 7)}, ${source.section}`;
		case "maintainer":
			return `maintainer ${source.date}, ${source.doc}`;
		default:
			return "no source";
	}
}

/**
 * @param {any} doc
 * @returns {string}
 */
export function renderPersonas(doc) {
	const lines = [
		"<!-- Generated from catalog.json by .storybook/catalog/catalog.mjs. Do not edit: edit catalog.json and run yarn catalog:write. -->",
		"",
		"# Personas and jobs",
		"",
		...HEADER.flatMap((paragraph) => [paragraph, ""]),
		"## Core job",
		"",
		doc.coreJob.statement,
		"",
		...doc.coreJob.clauses.map(
			(claim) =>
				`- [${claim.tag}] ${claim.field}: ${claim.text} (${sourceSummary(claim.source)})`,
		),
		"",
	];
	for (const persona of doc.personas) {
		lines.push(`## ${persona.label} (${persona.id})`, "");
		for (const claim of persona.claims) {
			lines.push(
				`- [${claim.tag}] ${claim.field}: ${claim.text} (${sourceSummary(claim.source)})`,
			);
		}
		lines.push("", "Red flags:", "");
		for (const flag of persona.redFlags) {
			lines.push(
				`- [${flag.tag}] ${flag.id} (${flag.kind}): ${flag.text} (${sourceSummary(flag.source)})`,
			);
		}
		lines.push("");
	}
	lines.push("## Jobs", "");
	for (const job of doc.jobs) {
		lines.push(
			`### ${job.id}`,
			"",
			`When ${job.when}, I want ${job.want}, so ${job.so}.`,
			"",
			`Personas: ${job.personas.join(", ")}`,
			"",
		);
		for (const claim of job.claims) {
			lines.push(
				`- [${claim.tag}] ${claim.field}: ${claim.text} (${sourceSummary(claim.source)})`,
			);
		}
		lines.push("");
	}
	return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
