// The scenario manifest and its drift check (JTBD-02, D-20 to D-23).
//
// scenarios.json is the one place a story is tied to a persona, a job, a state
// class, a tier, a one-line situation and a proof boundary. The manifest is
// authoritative and one-directional: a scenario lists its story ids, no story
// carries a tag or parameter, and a story that no scenario lists is a problem.
//
// Authoring rule for Phases 72-73: every story file sets an explicit `title`
// and `component` in `meta`, imports the component unaliased, and is added to
// scenarios.json in the same PR. There is no planned status: an unwritten
// scenario is a gap in the coverage grid, never a manifest row (D-22).
//
// `checkManifest` is pure: persona and job ids, the subject registry, the
// copy-lint ruleset and the file system all come in as parameters. Structural
// problems return early and a scenario whose stories lack a component skips
// its subject checks, so one planted defect yields one problem. Lengths are
// measured in UTF-16 code units (String.prototype.length), never rounded.
import fs from "node:fs";
import {
	compareCodeUnits,
	isPlainObject,
	readJson,
	resolveInRoot,
} from "./closed.mjs";
import { buildRuleset, lintText } from "./copy_lint.mjs";
import { loadCatalog } from "./personas.mjs";
import { enumerateStories } from "./story_index.mjs";
import { loadSubjects } from "./subjects.mjs";
import {
	PROOF_BOUNDARIES,
	SCENARIO_ID_PATTERN,
	STATE_CLASSES,
	TIERS,
} from "./vocab.mjs";

export const SCENARIOS_PATH = ".storybook/catalog/scenarios.json";

export const MANIFEST_CODES = Object.freeze([
	"not-object",
	"schema-version",
	"unknown-field",
	"bad-id",
	"duplicate-id",
	"unknown-persona",
	"unknown-job",
	"unknown-state-class",
	"unknown-tier",
	"unknown-proof-boundary",
	"unknown-subject",
	"missing-situation",
	"situation-banned",
	"missing-stories",
	"story-missing",
	"story-unmapped",
	"story-double-mapped",
	"missing-title",
	"missing-component",
	"mixed-subject",
	"tier-subject-mismatch",
	"job-persona-mismatch",
	"proof-ref-missing",
	"proof-ref-unexpected",
]);

const SITUATION_LIMIT = 140;
const TOP_KEYS = ["schemaVersion", "scenarios"];
const SCENARIO_KEYS = [
	"id",
	"persona",
	"job",
	"stateClass",
	"tier",
	"situation",
	"proofBoundary",
	"stories",
	"proofRef",
];
const UNIT_PROOF = /^tests\/(?:[^/]+\/)*[^/]+\.test\.ts$/;
const E2E_PROOF = /^tests\/e2e\/[^/]+\.spec\.ts$/;

/**
 * @param {string} code
 * @param {string} message
 * @param {{ scenario?: string, story?: string }} [ids]
 */
function found(code, message, ids = {}) {
	return { code, ...ids, message };
}

/**
 * @param {ReadonlyArray<{ code: string, scenario?: string, story?: string }>} problems
 */
function sortManifestProblems(problems) {
	return [...problems].sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.scenario ?? "", b.scenario ?? "") ||
			compareCodeUnits(a.story ?? "", b.story ?? ""),
	);
}

/**
 * @param {unknown} manifest
 * @returns {Array<ReturnType<typeof found>>}
 */
function structuralProblems(manifest) {
	if (!isPlainObject(manifest)) {
		return [found("not-object", "the manifest must be an object")];
	}
	const problems = [];
	for (const key of Object.keys(manifest)) {
		if (!TOP_KEYS.includes(key)) {
			problems.push(
				found("unknown-field", `the manifest has unknown key ${key}`),
			);
		}
	}
	if (manifest["schemaVersion"] !== 1) {
		problems.push(found("schema-version", "schemaVersion must be 1"));
	}
	const scenarios = manifest["scenarios"];
	if (!Array.isArray(scenarios)) {
		problems.push(found("not-object", "scenarios must be an array"));
		return problems;
	}
	const seen = new Set();
	for (const [index, scenario] of scenarios.entries()) {
		if (!isPlainObject(scenario)) {
			problems.push(found("not-object", `scenario ${index} must be an object`));
			continue;
		}
		const id = scenario["id"];
		const named = typeof id === "string" ? { scenario: id } : {};
		for (const key of Object.keys(scenario)) {
			if (!SCENARIO_KEYS.includes(key)) {
				problems.push(
					found(
						"unknown-field",
						`scenario ${String(id)} has unknown key ${key}`,
						named,
					),
				);
			}
		}
		if (typeof id !== "string" || !SCENARIO_ID_PATTERN.test(id)) {
			problems.push(
				found(
					"bad-id",
					`scenario ${index} needs an id like subject.slug`,
					named,
				),
			);
		} else if (seen.has(id)) {
			problems.push(
				found("duplicate-id", `scenario id ${id} is used twice`, named),
			);
		} else {
			seen.add(id);
		}
	}
	return problems;
}

/**
 * @param {unknown} situation
 */
function situationProblem(situation) {
	if (
		typeof situation !== "string" ||
		situation.trim() === "" ||
		/[\r\n]/.test(situation) ||
		situation.length > SITUATION_LIMIT
	) {
		return "a situation is one non-empty line of at most 140 characters";
	}
	return null;
}

/**
 * @param {object} inputs
 * @param {unknown} inputs.manifest
 * @param {ReadonlyArray<{ id: string, title: string | null, component: string | null }>} inputs.stories
 * @param {readonly string[]} inputs.personas
 * @param {Readonly<Record<string, readonly string[]>>} inputs.jobPersonas
 * @param {ReadonlyMap<string, string>} inputs.subjects
 * @param {(relPath: string) => boolean} inputs.fileExists
 * @param {{ rules: ReadonlyArray<any> }} inputs.ruleset
 */
export function checkManifest({
	manifest,
	stories,
	personas,
	jobPersonas,
	subjects,
	fileExists,
	ruleset,
}) {
	const structural = structuralProblems(manifest);
	if (structural.length > 0) return sortManifestProblems(structural);

	const scenarios = /** @type {Array<Record<string, any>>} */ (
		/** @type {any} */ (manifest).scenarios
	);
	const storyById = new Map(stories.map((story) => [story.id, story]));
	const problems = [];
	/** @type {Map<string, string[]>} */
	const mappedBy = new Map();

	for (const scenario of scenarios) {
		const id = scenario["id"];
		const at = { scenario: id };

		const persona = scenario["persona"];
		const personaOk = typeof persona === "string" && personas.includes(persona);
		if (!personaOk) {
			problems.push(
				found(
					"unknown-persona",
					`${id}: persona ${String(persona)} is not a persona id`,
					at,
				),
			);
		}
		const job = scenario["job"];
		const jobOk = typeof job === "string" && Object.hasOwn(jobPersonas, job);
		if (!jobOk) {
			problems.push(
				found("unknown-job", `${id}: job ${String(job)} is not a job id`, at),
			);
		}
		if (personaOk && jobOk && !jobPersonas[job]?.includes(persona)) {
			problems.push(
				found(
					"job-persona-mismatch",
					`${id}: job ${job} does not belong to persona ${persona}`,
					at,
				),
			);
		}
		if (!STATE_CLASSES.includes(scenario["stateClass"])) {
			problems.push(
				found(
					"unknown-state-class",
					`${id}: ${String(scenario["stateClass"])} is not a state class`,
					at,
				),
			);
		}
		const tier = scenario["tier"];
		const tierOk = TIERS.includes(tier);
		if (!tierOk) {
			problems.push(
				found("unknown-tier", `${id}: ${String(tier)} is not a tier`, at),
			);
		}

		const situation = scenario["situation"];
		const bad = situationProblem(situation);
		if (bad !== null) {
			problems.push(found("missing-situation", `${id}: ${bad}`, at));
		} else if (lintText(situation, ruleset).length > 0) {
			problems.push(
				found(
					"situation-banned",
					`${id}: the situation hits a copy-lint rule`,
					at,
				),
			);
		}

		const boundary = scenario["proofBoundary"];
		if (!PROOF_BOUNDARIES.includes(boundary)) {
			problems.push(
				found(
					"unknown-proof-boundary",
					`${id}: ${String(boundary)} is not a proof boundary`,
					at,
				),
			);
		} else {
			const hasRef = Object.hasOwn(scenario, "proofRef");
			if (boundary === "story") {
				if (hasRef) {
					problems.push(
						found(
							"proof-ref-unexpected",
							`${id}: a story-only scenario has no proofRef`,
							at,
						),
					);
				}
			} else {
				const pattern = boundary === "story+unit" ? UNIT_PROOF : E2E_PROOF;
				const ref = scenario["proofRef"];
				if (typeof ref !== "string" || !pattern.test(ref) || !fileExists(ref)) {
					problems.push(
						found(
							"proof-ref-missing",
							`${id}: ${boundary} needs a proofRef naming an existing ${boundary === "story+unit" ? "tests/**/*.test.ts" : "tests/e2e/*.spec.ts"} file`,
							at,
						),
					);
				}
			}
		}

		const listed = scenario["stories"];
		if (
			!Array.isArray(listed) ||
			listed.length === 0 ||
			listed.some((entry) => typeof entry !== "string" || entry === "")
		) {
			problems.push(
				found(
					"missing-stories",
					`${id}: a scenario lists at least one story id`,
					at,
				),
			);
			continue;
		}
		const present = [];
		for (const storyId of listed) {
			mappedBy.set(storyId, [...(mappedBy.get(storyId) ?? []), id]);
			const story = storyById.get(storyId);
			if (story === undefined) {
				problems.push(
					found("story-missing", `${id}: story ${storyId} does not exist`, {
						...at,
						story: storyId,
					}),
				);
			} else {
				present.push(story);
			}
		}

		if (
			present.length === 0 ||
			present.some((story) => story.component === null)
		) {
			continue;
		}
		const components = [...new Set(present.map((story) => story.component))];
		if (components.length > 1) {
			problems.push(
				found(
					"mixed-subject",
					`${id}: its stories use ${components.join(", ")} as meta.component`,
					at,
				),
			);
			continue;
		}
		const subject = /** @type {string} */ (components[0]);
		const subjectTier = subjects.get(subject);
		if (subjectTier === undefined) {
			problems.push(
				found(
					"unknown-subject",
					`${id}: ${subject} is not in subjects.json`,
					at,
				),
			);
		} else if (tierOk && subjectTier !== tier) {
			problems.push(
				found(
					"tier-subject-mismatch",
					`${id}: tier ${tier} but ${subject} is ${subjectTier}`,
					at,
				),
			);
		}
	}

	for (const [storyId, owners] of mappedBy) {
		if (owners.length > 1) {
			problems.push(
				found(
					"story-double-mapped",
					`story ${storyId} is listed by ${owners.join(" and ")}`,
					{
						scenario: /** @type {string} */ (owners[owners.length - 1]),
						story: storyId,
					},
				),
			);
		}
	}
	for (const story of stories) {
		if (!mappedBy.has(story.id)) {
			problems.push(
				found(
					"story-unmapped",
					`story ${story.id} (${story.title ?? "untitled"}) is in no scenario; add it to scenarios.json`,
					{ story: story.id },
				),
			);
		}
		if (story.title === null) {
			problems.push(
				found("missing-title", `story ${story.id} has no explicit meta.title`, {
					story: story.id,
				}),
			);
		}
		if (story.component === null) {
			problems.push(
				found("missing-component", `story ${story.id} has no meta.component`, {
					story: story.id,
				}),
			);
		}
	}
	return sortManifestProblems(problems);
}

/**
 * Everything `checkManifest` needs from the real tree.
 *
 * @param {string} root
 */
export async function loadManifestInputs(root) {
	const catalog = loadCatalog(root);
	const ruleset = buildRuleset(
		readJson(root, ".storybook/catalog/copy_lint_rules.json"),
		readJson(root, ".storybook/catalog/glossary.json"),
	);
	return {
		manifest: readJson(root, SCENARIOS_PATH),
		stories: await enumerateStories(root),
		personas: catalog.personaIds,
		jobPersonas: catalog.jobPersonas,
		subjects: loadSubjects(root),
		// resolveInRoot confines the path before any stat (T-71-14).
		fileExists: (/** @type {string} */ relPath) => {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return false;
			try {
				return fs.statSync(resolved).isFile();
			} catch {
				return false;
			}
		},
		ruleset,
	};
}
