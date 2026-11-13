// The journey format, its job set and the static e2e proof (FLW-01, D-22, D-24).
//
// One JSON file per catalog job at .storybook/catalog/journeys/J-0N.json:
//   { schemaVersion: 1, job, title, steps: [...] }          a journey, or
//   { schemaVersion: 1, job, title, exempt: "<reason>" }    a job with no control to operate
// A step is { scenario, action, proof, e2e?, note? }. The action is
// { role, name } (an exact English accessible name) or { gesture } for a step
// with no DOM control. The proof is one of story, story+e2e, e2e or unproven.
// Step ids (`J-04.3`) are derived from the position, never stored, so a
// reorder cannot leave a stale id. A journey stores no persona, state or
// situation: the scenario manifest owns those.
//
// What a proof honestly claims. `story`: some story of the step's scenario shows
// the control present, named, enabled and keyboard reachable (the browser probe,
// journey_probe.mjs, driven by journey_gate.test.tsx). `e2e`: the named test
// exists, is not skipped and has a static title; it is NOT executed or imported
// here, and it is not proven to exercise the step (a reviewer owns that). A
// gesture step has no control a story could show, so it can never claim `story`.
//
// This module is node only: it reaches node:fs and the typescript compiler, so
// the browser gate imports journey_probe.mjs and never this file. It is imported
// by storybook-node tests and, from the wiring plan on, by catalog.mjs.
//
// `checkJourneys` is pure: the catalog job ids, the scenario ids and the spec
// reader come in as parameters. Structural problems return early per file, so
// one planted defect yields one code. Lengths are UTF-16 code units.
import fs from "node:fs";
import ts from "typescript";
import {
	compareCodeUnits,
	isPlainObject,
	readJson,
	resolveInRoot,
} from "./closed.mjs";
import { JOURNEY_PROBE_CODES, stepId } from "./journey_probe.mjs";
import { loadCatalog } from "./personas.mjs";
import { JOB_ID_PATTERN } from "./vocab.mjs";

export { stepId, stepProblems } from "./journey_probe.mjs";

export const JOURNEYS_DIR = ".storybook/catalog/journeys";

const SCENARIOS_PATH = ".storybook/catalog/scenarios.json";

// The node-side codes. The probe codes (journey_probe.mjs) join them below; the
// one name in both lists is unknown-scenario, which the schema reports for a
// scenario id missing from the manifest and the probe reports for a scenario
// map that lacks it.
const NODE_CODES = [
	"not-object",
	"schema-version",
	"unknown-field",
	"bad-job",
	"job-file-mismatch",
	"bad-title",
	"exempt-shape",
	"no-steps",
	"step-shape",
	"bad-action",
	"bad-proof",
	"unknown-scenario",
	"note-required",
	"e2e-required",
	"e2e-unexpected",
	"gesture-story",
	"job-missing",
	"unknown-job",
	"e2e-path",
	"e2e-title-missing",
	"e2e-title-modified",
	"e2e-title-dynamic",
	"e2e-title-duplicate",
];

export const JOURNEY_CODES = Object.freeze(
	[...new Set([...JOURNEY_PROBE_CODES, ...NODE_CODES])].sort(compareCodeUnits),
);

const TOP_KEYS = ["schemaVersion", "job", "title", "steps", "exempt"];
const STEP_KEYS = ["scenario", "action", "proof", "e2e", "note"];
const PROOFS = ["story", "story+e2e", "e2e", "unproven"];
const TITLE_LIMIT = 80;
const EXEMPT_MINIMUM = 40;
// The same pattern as manifest.mjs E2E_PROOF for an e2e proof reference.
const E2E_SPEC = /^tests\/e2e\/[^/]+\.spec\.ts$/;
const MODIFIERS = ["skip", "fixme", "only"];

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isText(value) {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {string} code
 * @param {string} message
 * @param {{ job: string, step?: string }} ids
 */
function found(code, message, ids) {
	return { code, ...ids, message };
}

/**
 * @param {ReadonlyArray<{ code: string, job: string, step?: string, message: string }>} problems
 */
function sortJourneyProblems(problems) {
	return [...problems].sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.job, b.job) ||
			compareCodeUnits(a.step ?? "", b.step ?? "") ||
			compareCodeUnits(a.message, b.message),
	);
}

/**
 * The job a file name stands for: `J-04.json` is J-04.
 *
 * @param {string} file
 */
function jobOfFile(file) {
	return file.endsWith(".json") ? file.slice(0, -".json".length) : file;
}

/**
 * @param {unknown} action
 */
function actionIsValid(action) {
	if (!isPlainObject(action)) return false;
	const keys = Object.keys(action).sort(compareCodeUnits);
	if (keys.length === 1 && keys[0] === "gesture") {
		return isText(action["gesture"]);
	}
	return (
		keys.length === 2 &&
		keys[0] === "name" &&
		keys[1] === "role" &&
		isText(action["name"]) &&
		isText(action["role"])
	);
}

/**
 * @param {unknown} e2e
 */
function e2eIsValid(e2e) {
	if (!isPlainObject(e2e)) return false;
	const keys = Object.keys(e2e).sort(compareCodeUnits);
	return (
		keys.length === 2 &&
		keys[0] === "spec" &&
		keys[1] === "test" &&
		isText(e2e["spec"]) &&
		isText(e2e["test"])
	);
}

/**
 * Whole-file structure. A file with any structural problem reports only those.
 *
 * @param {string} job the job the file name stands for
 * @param {unknown} doc
 */
function structuralProblems(job, doc) {
	const ids = { job };
	if (!isPlainObject(doc)) {
		return [found("not-object", `${job}: a journey must be an object`, ids)];
	}
	const problems = [];
	for (const key of Object.keys(doc)) {
		if (!TOP_KEYS.includes(key)) {
			problems.push(
				found("unknown-field", `${job} has unknown key ${key}`, ids),
			);
		}
	}
	if (doc["schemaVersion"] !== 1) {
		problems.push(
			found("schema-version", `${job}: schemaVersion must be 1`, ids),
		);
	}
	const docJob = doc["job"];
	if (typeof docJob !== "string" || !JOB_ID_PATTERN.test(docJob)) {
		problems.push(found("bad-job", `${job}: job must look like J-04`, ids));
	} else if (docJob !== job) {
		problems.push(
			found(
				"job-file-mismatch",
				`${job}: the file names job ${job} but its job is ${docJob}`,
				ids,
			),
		);
	}
	const title = doc["title"];
	if (!isText(title) || title.length > TITLE_LIMIT) {
		problems.push(
			found(
				"bad-title",
				`${job}: title must be non-empty text of at most ${TITLE_LIMIT} characters`,
				ids,
			),
		);
	}
	const hasSteps = Object.hasOwn(doc, "steps");
	const hasExempt = Object.hasOwn(doc, "exempt");
	if (hasSteps && hasExempt) {
		problems.push(
			found("exempt-shape", `${job}: an exempt job carries no steps`, ids),
		);
	} else if (hasExempt) {
		const reason = doc["exempt"];
		if (typeof reason !== "string" || reason.trim().length < EXEMPT_MINIMUM) {
			problems.push(
				found(
					"exempt-shape",
					`${job}: exempt must be a reason of at least ${EXEMPT_MINIMUM} characters`,
					ids,
				),
			);
		}
	} else if (!hasSteps) {
		problems.push(
			found(
				"no-steps",
				`${job}: a journey needs steps or an exempt reason`,
				ids,
			),
		);
	} else {
		problems.push(...stepStructure(job, doc["steps"]));
	}
	return problems;
}

/**
 * @param {string} job
 * @param {unknown} steps
 */
function stepStructure(job, steps) {
	if (!Array.isArray(steps)) {
		return [found("step-shape", `${job}: steps must be an array`, { job })];
	}
	if (steps.length === 0) {
		return [found("no-steps", `${job}: steps must not be empty`, { job })];
	}
	const problems = [];
	for (const [index, step] of steps.entries()) {
		const ids = { job, step: stepId(job, index) };
		const where = ids.step;
		if (!isPlainObject(step)) {
			problems.push(found("step-shape", `${where} must be an object`, ids));
			continue;
		}
		for (const key of Object.keys(step)) {
			if (!STEP_KEYS.includes(key)) {
				problems.push(
					found("unknown-field", `${where} has unknown key ${key}`, ids),
				);
			}
		}
		for (const key of ["scenario", "action", "proof"]) {
			if (!Object.hasOwn(step, key)) {
				problems.push(found("step-shape", `${where} is missing ${key}`, ids));
			}
		}
		if (Object.hasOwn(step, "scenario") && !isText(step["scenario"])) {
			problems.push(
				found("step-shape", `${where}: scenario must be text`, ids),
			);
		}
		if (Object.hasOwn(step, "note") && !isText(step["note"])) {
			problems.push(found("step-shape", `${where}: note must be text`, ids));
		}
		if (Object.hasOwn(step, "e2e") && !e2eIsValid(step["e2e"])) {
			problems.push(
				found("step-shape", `${where}: e2e must be { spec, test }`, ids),
			);
		}
		if (Object.hasOwn(step, "action") && !actionIsValid(step["action"])) {
			problems.push(
				found(
					"bad-action",
					`${where}: action must be { role, name } or { gesture }`,
					ids,
				),
			);
		}
		if (Object.hasOwn(step, "proof") && !PROOFS.includes(step["proof"])) {
			problems.push(
				found(
					"bad-proof",
					`${where}: proof must be one of ${PROOFS.join(", ")}`,
					ids,
				),
			);
		}
	}
	return problems;
}

/**
 * What the compiler API sees in one spec file, walking the whole tree: a title
 * sits inside `test.describe` callbacks, so a top-level scan would miss it.
 * Nothing is executed or imported.
 *
 *   titles    string-literal first arguments of a bare `test(...)` call
 *   modified  titles reachable only through `test.skip`, `test.fixme` or
 *             `test.only`, directly or through a describe wrapper of those
 *   dynamic   the literal head of every other first argument (a template
 *             literal's head text, or "" when there is none)
 *
 * @param {object} inputs
 * @param {string} inputs.text
 * @param {string} inputs.file
 * @returns {{ titles: string[], modified: string[], dynamic: string[] }}
 */
export function e2eTitles({ text, file }) {
	const source = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	/** @type {string[]} */
	const titles = [];
	/** @type {string[]} */
	const modified = [];
	/** @type {string[]} */
	const dynamic = [];
	/**
	 * @param {ts.Node} node
	 * @param {boolean} underModifier inside a skipped, fixme'd or focused wrapper
	 */
	const visit = (node, underModifier) => {
		let inside = underModifier;
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const first = node.arguments[0];
			const literal =
				first !== undefined &&
				(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
					? first.text
					: null;
			if (ts.isIdentifier(callee) && callee.text === "test") {
				if (literal !== null) {
					(underModifier ? modified : titles).push(literal);
				} else {
					dynamic.push(
						first !== undefined && ts.isTemplateExpression(first)
							? first.head.text
							: "",
					);
				}
			} else if (ts.isPropertyAccessExpression(callee)) {
				const chain = memberChain(callee);
				if (chain !== null && chain[0] === "test") {
					const members = chain.slice(1);
					if (members.length === 1 && MODIFIERS.includes(members[0] ?? "")) {
						if (literal !== null) modified.push(literal);
					} else if (members.some((member) => MODIFIERS.includes(member))) {
						inside = true;
					}
				}
			}
		}
		ts.forEachChild(node, (child) => visit(child, inside));
	};
	visit(source, false);
	return { titles, modified, dynamic };
}

/**
 * `test.describe.skip` is ["test", "describe", "skip"]; anything not rooted in
 * plain identifiers and property accesses is null.
 *
 * @param {ts.Expression} expression
 * @returns {string[] | null}
 */
function memberChain(expression) {
	if (ts.isIdentifier(expression)) return [expression.text];
	if (ts.isPropertyAccessExpression(expression)) {
		const base = memberChain(expression.expression);
		return base === null ? null : [...base, expression.name.text];
	}
	return null;
}

/**
 * @param {string} title
 * @param {{ titles: string[], modified: string[], dynamic: string[] }} parsed
 * @returns {{ code: string, why: string } | null}
 */
function titleProblem(title, parsed) {
	const hits = parsed.titles.filter((candidate) => candidate === title).length;
	if (hits === 1) return null;
	if (hits > 1) {
		return { code: "e2e-title-duplicate", why: `is declared ${hits} times` };
	}
	if (parsed.modified.includes(title)) {
		return {
			code: "e2e-title-modified",
			why: "is only reachable through test.skip, test.fixme or test.only",
		};
	}
	if (parsed.dynamic.some((head) => head !== "" && title.startsWith(head))) {
		return {
			code: "e2e-title-dynamic",
			why: "is only generated by a dynamic title, which a static check cannot prove",
		};
	}
	return { code: "e2e-title-missing", why: "is not a test title in that file" };
}

/**
 * Per-step values, after the structure of the whole file is known to be sound.
 *
 * @param {object} inputs
 * @param {string} inputs.job
 * @param {ReadonlyArray<any>} inputs.steps
 * @param {ReadonlySet<string>} inputs.scenarioIds
 * @param {(relPath: string) => string | null} inputs.readSpec
 * @param {Map<string, ReturnType<typeof e2eTitles> | null>} inputs.parsedSpecs
 */
function valueProblems({ job, steps, scenarioIds, readSpec, parsedSpecs }) {
	const problems = [];
	for (const [index, step] of steps.entries()) {
		const ids = { job, step: stepId(job, index) };
		const where = ids.step;
		const { scenario, action, proof, e2e, note } = step;
		if (!scenarioIds.has(scenario)) {
			problems.push(
				found(
					"unknown-scenario",
					`${where}: scenario ${scenario} is not in the scenario manifest`,
					ids,
				),
			);
		}
		const isGesture = Object.hasOwn(action, "gesture");
		if (isGesture && (proof === "story" || proof === "story+e2e")) {
			problems.push(
				found(
					"gesture-story",
					`${where}: a gesture has no control a story could show, so it cannot claim ${proof}`,
					ids,
				),
			);
		}
		if (proof === "unproven" && note === undefined) {
			problems.push(
				found("note-required", `${where}: an unproven step needs a note`, ids),
			);
		}
		const needsE2e = proof === "story+e2e" || proof === "e2e";
		if (needsE2e && e2e === undefined) {
			problems.push(
				found(
					"e2e-required",
					`${where}: proof ${proof} needs an e2e reference`,
					ids,
				),
			);
		}
		if (!needsE2e && e2e !== undefined) {
			problems.push(
				found(
					"e2e-unexpected",
					`${where}: proof ${proof} takes no e2e reference`,
					ids,
				),
			);
		}
		if (needsE2e && e2e !== undefined) {
			problems.push(...e2eProblems({ where, ids, e2e, readSpec, parsedSpecs }));
		}
	}
	return problems;
}

/**
 * The static e2e proof (D-24): the path is pattern-checked before any read, the
 * file is parsed (never run) and the title must be a live static title.
 *
 * @param {object} inputs
 * @param {string} inputs.where
 * @param {{ job: string, step: string }} inputs.ids
 * @param {{ spec: string, test: string }} inputs.e2e
 * @param {(relPath: string) => string | null} inputs.readSpec
 * @param {Map<string, ReturnType<typeof e2eTitles> | null>} inputs.parsedSpecs
 */
function e2eProblems({ where, ids, e2e, readSpec, parsedSpecs }) {
	if (!E2E_SPEC.test(e2e.spec)) {
		return [
			found(
				"e2e-path",
				`${where}: e2e spec ${e2e.spec} must look like tests/e2e/<name>.spec.ts`,
				ids,
			),
		];
	}
	if (!parsedSpecs.has(e2e.spec)) {
		const text = readSpec(e2e.spec);
		parsedSpecs.set(
			e2e.spec,
			text === null ? null : e2eTitles({ text, file: e2e.spec }),
		);
	}
	const parsed = parsedSpecs.get(e2e.spec) ?? null;
	if (parsed === null) {
		return [
			found("e2e-path", `${where}: e2e spec ${e2e.spec} does not exist`, ids),
		];
	}
	const problem = titleProblem(e2e.test, parsed);
	return problem === null
		? []
		: [
				found(
					problem.code,
					`${where}: e2e test "${e2e.test}" in ${e2e.spec} ${problem.why}`,
					ids,
				),
			];
}

/**
 * @param {object} inputs
 * @param {ReadonlyArray<{ file: string, doc: unknown }>} inputs.journeys
 * @param {readonly string[]} inputs.jobIds the catalog job ids
 * @param {ReadonlySet<string>} inputs.scenarioIds
 * @param {(relPath: string) => string | null} inputs.readSpec
 */
export function checkJourneys({ journeys, jobIds, scenarioIds, readSpec }) {
	const problems = [];
	const present = new Set();
	/** @type {Map<string, ReturnType<typeof e2eTitles> | null>} */
	const parsedSpecs = new Map();
	for (const { file, doc } of journeys) {
		const job = jobOfFile(file);
		present.add(job);
		const structural = structuralProblems(job, doc);
		if (structural.length > 0) {
			problems.push(...structural);
			continue;
		}
		const steps = /** @type {any} */ (doc).steps;
		if (Array.isArray(steps)) {
			problems.push(
				...valueProblems({ job, steps, scenarioIds, readSpec, parsedSpecs }),
			);
		}
	}
	for (const id of jobIds) {
		if (!present.has(id)) {
			problems.push(
				found("job-missing", `job ${id} has no journey file ${id}.json`, {
					job: id,
				}),
			);
		}
	}
	for (const job of present) {
		if (!jobIds.includes(job)) {
			problems.push(
				found("unknown-job", `${job}.json is not a job in the catalog`, {
					job,
				}),
			);
		}
	}
	return sortJourneyProblems(problems);
}

/**
 * Reads .storybook/catalog/journeys/*.json (an absent directory is an empty
 * set), the catalog job ids and the scenario ids. `readSpec` resolves a spec
 * path through resolveInRoot before any read (T-71-14 confinement), so an
 * absolute path, a `..` segment, a backslash, a colon or a wildcard reads
 * nothing.
 *
 * @param {string} root
 */
export function loadJourneyInputs(root) {
	const dir = resolveInRoot(root, JOURNEYS_DIR);
	/** @type {string[]} */
	let names = [];
	try {
		names = fs
			.readdirSync(dir ?? "")
			.filter((name) => name.endsWith(".json"))
			.sort(compareCodeUnits);
	} catch (error) {
		if (!(error instanceof Error) || Reflect.get(error, "code") !== "ENOENT") {
			throw error;
		}
	}
	const journeys = names.map((name) => ({
		file: name,
		doc: readJson(root, `${JOURNEYS_DIR}/${name}`),
	}));
	const manifest = /** @type {any} */ (readJson(root, SCENARIOS_PATH));
	const scenarioIds = new Set(
		Array.isArray(manifest?.scenarios)
			? manifest.scenarios.map((/** @type {any} */ scenario) => scenario.id)
			: [],
	);
	return {
		journeys,
		jobIds: loadCatalog(root).jobIds,
		scenarioIds,
		/** @param {string} relPath */
		readSpec(relPath) {
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
 * @param {string} text
 */
function cell(text) {
	return text.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
}

/**
 * @param {any} action
 */
function actionText(action) {
	return Object.hasOwn(action, "gesture")
		? `gesture: ${action.gesture}`
		: `${action.role} "${action.name}"`;
}

/**
 * JOURNEYS.md: steps in file order with their derived ids, jobs sorted by id.
 *
 * @param {ReadonlyArray<{ file: string, doc: any }>} journeys
 */
export function renderJourneys(journeys) {
	const ordered = [...journeys].sort(
		(a, b) =>
			compareCodeUnits(a.doc.job, b.doc.job) ||
			compareCodeUnits(a.file, b.file),
	);
	const lines = [
		"<!-- Generated from .storybook/catalog/journeys/*.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->",
		"",
		"# Journeys",
		"",
		"Each job has one journey of ordered steps. Proof `story` means some story of the step's scenario shows the control present, named, enabled and keyboard reachable; it does not claim the control works. Proof `e2e` names a test that exists and is not skipped; it does not claim the test exercises the step. `unproven` steps say why in their note.",
	];
	for (const { doc } of ordered) {
		lines.push("", `## ${doc.job}: ${cell(doc.title)}`, "");
		if (Object.hasOwn(doc, "exempt")) {
			lines.push(`Exempt: ${cell(doc.exempt)}`);
			continue;
		}
		lines.push(
			"| Step | Scenario | Action | Proof | e2e | Note |",
			"| --- | --- | --- | --- | --- | --- |",
		);
		for (const [index, step] of doc.steps.entries()) {
			const e2e =
				step.e2e === undefined ? "" : `${step.e2e.spec} › ${step.e2e.test}`;
			lines.push(
				`| ${stepId(doc.job, index)} | ${cell(step.scenario)} | ${cell(actionText(step.action))} | ${step.proof} | ${cell(e2e)} | ${cell(step.note ?? "")} |`,
			);
		}
	}
	return `${lines.join("\n")}\n`;
}
