// The coverage grid: subjects against state classes (JTBD-03, D-24 to D-27).
//
// 21 subjects x 12 state classes. A cell is `covered` by the scenarios in
// scenarios.json that name its subject (the shared `meta.component` of the
// scenario's stories) and state class, `waived` by a reasoned entry in
// waivers.json, or a `gap`. A gap is computed, never typed: waivers have no
// status field and there is no placeholder scenario.
//
// Two rules keep the grid honest:
//   - validateWaivers rejects a global waiver mechanically (wildcard, array,
//     unresolved ref, full row, full column, duplicate, shadowed, unknown
//     subject). Whether a reason is true stays reviewer judgement: prose
//     thresholds were rejected as gameable (D-25).
//   - gapRatchet fails a gap that is new against the merge-base copy of
//     coverage-grid.json (D-26); an absent base is admitted once as bootstrap.
//
// Everything below the loaders is pure over its parameters.
import fs from "node:fs";
import path from "node:path";
import {
	canonicalJson,
	closedKeys,
	compareCodeUnits,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
} from "./closed.mjs";
import { SCENARIOS_PATH } from "./manifest.mjs";
import { enumerateStories } from "./story_index.mjs";
import { loadSubjects } from "./subjects.mjs";
import {
	STATE_CLASS_DEFS,
	STATE_CLASSES,
	TIER_DUE,
	TIERS,
	WAIVER_BASES,
} from "./vocab.mjs";

export const WAIVERS_PATH = ".storybook/catalog/waivers.json";
export const GRID_JSON_PATH = ".storybook/catalog/coverage-grid.json";
export const GRID_MD_PATH = ".storybook/catalog/COVERAGE-GRID.md";

export const GRID_CODES = Object.freeze(["gap-added", "new-row-gap", "gap"]);

export const WAIVER_CODES = Object.freeze([
	"not-object",
	"schema-version",
	"unknown-field",
	"missing-field",
	"bad-subject",
	"unknown-subject",
	"bad-state-class",
	"bad-basis",
	"ref-unresolved",
	"reason-short",
	"waiver-duplicate",
	"waiver-shadowed",
	"full-row",
	"full-column",
]);

const REASON_MINIMUM = 40;
const WAIVER_KEYS = ["subject", "stateClass", "basis", "ref", "reason"];
const WILDCARD = /[*?[\]{}]/;
const E2E_REF = /^tests\/e2e\/[^/]+\.spec\.ts$/;

/**
 * The fingerprint pipe convention: `<Subject>|<state>`.
 *
 * @param {string} subject
 * @param {string} stateClass
 * @returns {string}
 */
export function cellKey(subject, stateClass) {
	return `${subject}|${stateClass}`;
}

/**
 * Cell key to the sorted ids of the scenarios that cover it. The subject of a
 * scenario is the shared `component` of its stories; a scenario whose stories
 * are missing or component-less is the manifest check's problem, not a cell.
 *
 * @param {object} inputs
 * @param {ReadonlyMap<string, string>} inputs.subjects
 * @param {ReadonlyArray<Record<string, any>>} inputs.scenarios
 * @param {ReadonlyArray<{ id: string, component: string | null }>} inputs.stories
 * @returns {Map<string, string[]>}
 */
export function coveredCells({ subjects, scenarios, stories }) {
	const storyById = new Map(stories.map((story) => [story.id, story]));
	/** @type {Map<string, string[]>} */
	const covered = new Map();
	for (const scenario of scenarios) {
		const listed = Array.isArray(scenario["stories"])
			? scenario["stories"]
			: [];
		const component = listed
			.map((id) => storyById.get(id)?.component ?? null)
			.find((name) => name !== null);
		const stateClass = scenario["stateClass"];
		if (
			component === undefined ||
			component === null ||
			!subjects.has(component) ||
			!STATE_CLASSES.includes(stateClass) ||
			typeof scenario["id"] !== "string"
		) {
			continue;
		}
		const key = cellKey(component, stateClass);
		covered.set(key, [...(covered.get(key) ?? []), scenario["id"]]);
	}
	for (const [key, ids] of covered) {
		covered.set(key, [...ids].sort(compareCodeUnits));
	}
	return covered;
}

/**
 * @param {object} inputs
 * @param {ReadonlyMap<string, string>} inputs.subjects subject id to tier
 * @param {ReadonlyArray<Record<string, any>>} inputs.scenarios
 * @param {ReadonlyArray<{ id: string, component: string | null }>} inputs.stories
 * @param {ReadonlyArray<{ subject: string, stateClass: string, basis: string, ref: string, reason: string }>} inputs.waivers
 */
export function buildGrid({ subjects, scenarios, stories, waivers }) {
	const covered = coveredCells({ subjects, scenarios, stories });
	const waiverByCell = new Map(
		waivers.map((waiver) => [
			cellKey(waiver.subject, waiver.stateClass),
			waiver,
		]),
	);
	const ordered = [...subjects.entries()].sort(
		([idA, tierA], [idB, tierB]) =>
			TIERS.indexOf(tierA) - TIERS.indexOf(tierB) || compareCodeUnits(idA, idB),
	);
	const counts = {
		subjects: ordered.length,
		states: STATE_CLASSES.length,
		cells: 0,
		covered: 0,
		waived: 0,
		gaps: 0,
	};
	const rows = [];
	for (const [subject, tier] of ordered) {
		/** @type {Record<string, { status: string, scenarios?: string[], waiver?: { basis: string, ref: string, reason: string } }>} */
		const cells = {};
		for (const stateClass of STATE_CLASSES) {
			const key = cellKey(subject, stateClass);
			const scenarioIds = covered.get(key);
			const waiver = waiverByCell.get(key);
			counts.cells += 1;
			if (scenarioIds !== undefined) {
				cells[stateClass] = { status: "covered", scenarios: scenarioIds };
				counts.covered += 1;
			} else if (waiver !== undefined) {
				cells[stateClass] = {
					status: "waived",
					waiver: {
						basis: waiver.basis,
						ref: waiver.ref,
						reason: waiver.reason,
					},
				};
				counts.waived += 1;
			} else {
				cells[stateClass] = { status: "gap" };
				counts.gaps += 1;
			}
		}
		rows.push({ subject, tier, cells });
	}
	return { counts, rows };
}

/**
 * @param {ReturnType<typeof buildGrid>} model
 * @returns {string}
 */
export function renderGridJson(model) {
	return canonicalJson({
		schemaVersion: 1,
		counts: model.counts,
		rows: model.rows,
	});
}

/**
 * @param {ReturnType<typeof buildGrid>} model
 * @returns {string}
 */
export function renderGridMarkdown(model) {
	const { counts } = model;
	const lines = [
		"<!-- Generated from scenarios.json, subjects.json and waivers.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->",
		"",
		"# Coverage grid",
		"",
		`${counts.subjects} subjects x ${counts.states} state classes = ${counts.cells} cells: ${counts.covered} covered, ${counts.waived} waived, ${counts.gaps} gaps.`,
		"",
		"A cell is covered by a scenario in scenarios.json, waived with a reason in waivers.json, or a gap. A gap is computed, never typed. Cells show the scenario count, `waived` or `gap`. A gap is owed by the phase in the Due column: primitive and pattern rows by Phase 72, area and screen rows by Phase 73.",
		"",
		`| Subject | Tier | Due | ${STATE_CLASSES.join(" | ")} |`,
		`| --- | --- | --- | ${STATE_CLASSES.map(() => "---").join(" | ")} |`,
	];
	const waivers = [];
	for (const row of model.rows) {
		const due = `Phase ${TIER_DUE[/** @type {keyof typeof TIER_DUE} */ (row.tier)]}`;
		const shown = STATE_CLASSES.map((stateClass) => {
			const cell = row.cells[stateClass];
			if (cell?.status === "covered")
				return String(cell.scenarios?.length ?? 0);
			if (cell?.status === "waived") {
				waivers.push({ key: cellKey(row.subject, stateClass), cell });
				return "waived";
			}
			return "gap";
		});
		lines.push(
			`| ${row.subject} | ${row.tier} | ${due} | ${shown.join(" | ")} |`,
		);
	}
	lines.push("", "## Waivers", "");
	if (waivers.length === 0) {
		lines.push("none");
	} else {
		for (const { key, cell } of waivers) {
			lines.push(
				`- ${key}: ${cell.waiver?.basis} (${cell.waiver?.ref}): ${cell.waiver?.reason}`,
			);
		}
	}
	lines.push("", "## State classes", "");
	for (const stateClass of STATE_CLASSES) {
		lines.push(
			`- **${stateClass}**: ${STATE_CLASS_DEFS[stateClass].definition}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

/**
 * Pure over two grid JSON documents. `base` null (no grid at the merge-base)
 * is admitted once as the bootstrap. Removed rows are fine.
 *
 * @param {{ base: any, head: any }} documents
 * @returns {{ problems: Array<{ code: string, message: string, cell?: string }>, notes: string[] }}
 */
export function gapRatchet({ base, head }) {
	if (base === null || base === undefined) {
		return { problems: [], notes: ["bootstrap"] };
	}
	const baseRows = new Map(
		(Array.isArray(base.rows) ? base.rows : []).map((row) => [
			row.subject,
			row,
		]),
	);
	const problems = [];
	for (const row of Array.isArray(head.rows) ? head.rows : []) {
		const baseRow = baseRows.get(row.subject);
		if (baseRow === undefined) {
			const gaps = STATE_CLASSES.filter(
				(stateClass) => row.cells?.[stateClass]?.status === "gap",
			);
			if (gaps.length > 0) {
				problems.push({
					code: "new-row-gap",
					cell: row.subject,
					message: `new row ${row.subject} has ${gaps.length} gap${gaps.length === 1 ? "" : "s"}; a new subject arrives with every state covered or waived`,
				});
			}
			continue;
		}
		for (const stateClass of STATE_CLASSES) {
			const atHead = row.cells?.[stateClass]?.status;
			const atBase = baseRow.cells?.[stateClass]?.status;
			if (atHead === "gap" && atBase !== "gap") {
				problems.push({
					code: "gap-added",
					cell: cellKey(row.subject, stateClass),
					message: `${cellKey(row.subject, stateClass)} was ${atBase ?? "absent"} at the merge-base and is a gap now`,
				});
			}
		}
	}
	return { problems, notes: [] };
}

/**
 * One `gap` problem per gap cell in the given tiers (every tier when none).
 *
 * @param {ReturnType<typeof buildGrid>} model
 * @param {readonly string[]} [tiers]
 */
export function zeroGapProblems(model, tiers = []) {
	const found = [];
	for (const row of model.rows) {
		if (tiers.length > 0 && !tiers.includes(row.tier)) continue;
		for (const stateClass of STATE_CLASSES) {
			if (row.cells[stateClass]?.status === "gap") {
				found.push({
					code: "gap",
					cell: cellKey(row.subject, stateClass),
					message: `gap|${cellKey(row.subject, stateClass)}`,
				});
			}
		}
	}
	return found;
}

/**
 * @param {Map<string, Set<string>>} map
 * @param {string} key
 * @param {string} value
 */
function addTo(map, key, value) {
	const set = map.get(key) ?? new Set();
	set.add(value);
	map.set(key, set);
}

/**
 * @param {unknown} ref
 * @param {string} basis
 * @param {string} subject
 * @param {{ subjectFiles: ReadonlyMap<string, string>, scenarioIds: ReadonlySet<string>, readText: (relPath: string) => string | null, fileExists: (relPath: string) => boolean }} ctx
 */
function refResolves(ref, basis, subject, ctx) {
	if (typeof ref !== "string" || ref === "") return false;
	if (basis === "duplicate") return ctx.scenarioIds.has(ref);
	if (basis === "e2e") return E2E_REF.test(ref) && ctx.fileExists(ref);
	// unreachable: the subject's own source file and a symbol it contains.
	const hash = ref.indexOf("#");
	if (hash <= 0 || hash === ref.length - 1) return false;
	const file = ref.slice(0, hash);
	const symbol = ref.slice(hash + 1);
	if (file !== ctx.subjectFiles.get(subject)) return false;
	return ctx.readText(file)?.includes(symbol) === true;
}

/**
 * Pure (D-25). Structure first, then values, then the cross-waiver rules, so
 * one planted defect yields one code.
 *
 * @param {unknown} doc
 * @param {object} ctx
 * @param {ReadonlyMap<string, string>} ctx.subjects
 * @param {ReadonlyMap<string, string>} ctx.subjectFiles
 * @param {ReadonlySet<string>} ctx.coveredCells
 * @param {ReadonlySet<string>} ctx.scenarioIds
 * @param {(relPath: string) => string | null} ctx.readText
 * @param {(relPath: string) => boolean} ctx.fileExists
 */
export function validateWaivers(doc, ctx) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "waivers.json must be an object")];
	}
	const structural = closedKeys(
		doc,
		["schemaVersion", "waivers"],
		[],
		"waivers.json",
	);
	if (Object.hasOwn(doc, "schemaVersion") && doc["schemaVersion"] !== 1) {
		structural.push(problem("schema-version", "schemaVersion must be 1"));
	}
	const listed = doc["waivers"];
	if (!Array.isArray(listed)) {
		if (Object.hasOwn(doc, "waivers")) {
			structural.push(problem("not-object", "waivers must be an array"));
		}
		return sortProblems(structural);
	}
	for (const [index, entry] of listed.entries()) {
		const where = `waiver ${index}`;
		if (!isPlainObject(entry)) {
			structural.push(problem("not-object", `${where} must be an object`));
		} else {
			structural.push(...closedKeys(entry, WAIVER_KEYS, [], where));
		}
	}
	if (structural.length > 0) return sortProblems(structural);

	const found = [];
	/** @type {Map<string, number>} */
	const perCell = new Map();
	/** @type {Map<string, Set<string>>} */
	const statesBySubject = new Map();
	/** @type {Map<string, Set<string>>} */
	const subjectsByState = new Map();
	for (const [index, waiver] of /** @type {Array<Record<string, any>>} */ (
		listed
	).entries()) {
		const where = `waiver ${index}`;
		const subject = waiver["subject"];
		const stateClass = waiver["stateClass"];
		const basis = waiver["basis"];
		let subjectOk = false;
		if (
			typeof subject !== "string" ||
			subject === "" ||
			WILDCARD.test(subject)
		) {
			found.push(
				problem(
					"bad-subject",
					`${where}: a waiver names one subject, never a wildcard or a list`,
				),
			);
		} else if (!ctx.subjects.has(subject)) {
			found.push(
				problem(
					"unknown-subject",
					`${where}: ${subject} is not in subjects.json`,
				),
			);
		} else {
			subjectOk = true;
		}
		const stateOk = STATE_CLASSES.includes(stateClass);
		if (!stateOk) {
			found.push(
				problem(
					"bad-state-class",
					`${where}: ${String(stateClass)} is not one of the 12 state classes`,
				),
			);
		}
		const basisOk = WAIVER_BASES.includes(basis);
		if (!basisOk) {
			found.push(
				problem(
					"bad-basis",
					`${where}: basis must be one of ${WAIVER_BASES.join(", ")}`,
				),
			);
		}
		if (
			subjectOk &&
			basisOk &&
			!refResolves(waiver["ref"], basis, subject, ctx)
		) {
			found.push(
				problem(
					"ref-unresolved",
					`${where}: ${String(waiver["ref"])} does not resolve for basis ${basis}`,
				),
			);
		}
		const reason = waiver["reason"];
		if (typeof reason !== "string" || reason.trim().length < REASON_MINIMUM) {
			found.push(
				problem(
					"reason-short",
					`${where}: a reason is at least ${REASON_MINIMUM} characters`,
				),
			);
		}
		if (subjectOk && stateOk) {
			const key = cellKey(subject, stateClass);
			perCell.set(key, (perCell.get(key) ?? 0) + 1);
			addTo(statesBySubject, subject, stateClass);
			addTo(subjectsByState, stateClass, subject);
		}
	}
	for (const [key, count] of perCell) {
		if (count > 1) {
			found.push(
				problem("waiver-duplicate", `${key} has ${count} waivers`, { id: key }),
			);
		}
		if (ctx.coveredCells.has(key)) {
			found.push(
				problem(
					"waiver-shadowed",
					`${key} is covered by a scenario; delete its waiver`,
					{ id: key },
				),
			);
		}
	}
	for (const [subject, states] of statesBySubject) {
		if (states.size === STATE_CLASSES.length) {
			found.push(
				problem("full-row", `every state of ${subject} is waived`, {
					id: subject,
				}),
			);
		}
	}
	for (const [stateClass, waivedSubjects] of subjectsByState) {
		if (ctx.subjects.size > 0 && waivedSubjects.size === ctx.subjects.size) {
			found.push(
				problem("full-column", `${stateClass} is waived for every subject`, {
					id: stateClass,
				}),
			);
		}
	}
	return sortProblems(found);
}

/**
 * Subject id to its repo-relative source file (the first on a collision, which
 * the subject registry reports separately).
 *
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function scanSubjectFiles(root) {
	/** @type {Map<string, string>} */
	const files = new Map();
	/** @param {string} relative */
	const walk = (relative) => {
		for (const entry of fs
			.readdirSync(path.join(root, relative), { withFileTypes: true })
			.sort((a, b) => compareCodeUnits(a.name, b.name))) {
			const child = `${relative}/${entry.name}`;
			if (entry.isDirectory()) {
				walk(child);
			} else if (
				entry.name.endsWith(".tsx") &&
				!entry.name.endsWith(".stories.tsx")
			) {
				const id = entry.name.slice(0, -".tsx".length);
				if (!files.has(id)) files.set(id, child);
			}
		}
	};
	walk("src/renderer/components");
	if (fs.existsSync(path.join(root, "src/renderer/App.tsx"))) {
		files.set("App", "src/renderer/App.tsx");
	}
	return files;
}

/**
 * Everything the grid needs from the real tree.
 *
 * @param {string} root
 */
export async function loadGridInputs(root) {
	const subjects = loadSubjects(root);
	const manifest = readJson(root, SCENARIOS_PATH);
	if (!isPlainObject(manifest) || !Array.isArray(manifest["scenarios"])) {
		throw new Error(`${SCENARIOS_PATH} must hold a scenarios array`);
	}
	return {
		subjects,
		subjectFiles: scanSubjectFiles(root),
		scenarios: /** @type {Array<Record<string, any>>} */ (
			manifest["scenarios"]
		),
		stories: await enumerateStories(root),
		waivers: readJson(root, WAIVERS_PATH),
	};
}

/**
 * The `validateWaivers` context over loaded inputs. Every path is confined by
 * `resolveInRoot` before it is read or stat-ed.
 *
 * @param {string} root
 * @param {Awaited<ReturnType<typeof loadGridInputs>>} inputs
 */
export function waiverContext(root, inputs) {
	return {
		subjects: inputs.subjects,
		subjectFiles: inputs.subjectFiles,
		coveredCells: new Set(coveredCells(inputs).keys()),
		scenarioIds: new Set(
			inputs.scenarios
				.map((scenario) => scenario["id"])
				.filter((id) => typeof id === "string"),
		),
		readText: (/** @type {string} */ relPath) => {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return null;
			try {
				return fs.readFileSync(resolved, "utf8");
			} catch {
				return null;
			}
		},
		fileExists: (/** @type {string} */ relPath) => {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return false;
			try {
				return fs.statSync(resolved).isFile();
			} catch {
				return false;
			}
		},
	};
}

/**
 * Validate the waivers, then build the grid. `model` is null when a waiver is
 * rejected, so neither mode ever renders a grid from invalid waivers.
 *
 * @param {string} root
 */
export async function loadGrid(root) {
	const inputs = await loadGridInputs(root);
	const problems = validateWaivers(inputs.waivers, waiverContext(root, inputs));
	if (problems.length > 0) {
		return { problems, model: null, stories: inputs.stories };
	}
	const model = buildGrid({
		subjects: inputs.subjects,
		scenarios: inputs.scenarios,
		stories: inputs.stories,
		waivers: /** @type {any} */ (inputs.waivers).waivers,
	});
	return { problems, model, stories: inputs.stories };
}
