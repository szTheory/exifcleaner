// The authored subject registry and its closure check (JTBD-03 rows, D-24).
//
// A subject is the PascalCase basename of every
// src/renderer/components/**/*.tsx that is not a story, plus App. The tier of
// each subject is authored in subjects.json, never generated. The closure
// check runs in both directions: a component without a row, a row without a
// component, and a basename collision each fail.
//
// Structure is checked before the scan comparison, so one planted defect
// yields one code.
import fs from "node:fs";
import path from "node:path";
import {
	closedKeys,
	compareCodeUnits,
	isPlainObject,
	problem,
	readJson,
	sortProblems,
} from "./closed.mjs";
import { TIERS } from "./vocab.mjs";

export const SUBJECTS_PATH = ".storybook/catalog/subjects.json";

export const SUBJECT_CODES = Object.freeze([
	"not-array",
	"not-object",
	"unknown-field",
	"missing-field",
	"bad-id",
	"bad-tier",
	"duplicate-id",
	"unsorted",
	"subject-unregistered",
	"subject-stale",
	"subject-collision",
]);

const SUBJECT_ID_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

/**
 * @param {string} root
 * @returns {{ ids: string[], collisions: string[] }}
 */
export function scanSubjectIds(root) {
	const seen = new Map();
	/** @param {string} name */
	const note = (name) => seen.set(name, (seen.get(name) ?? 0) + 1);
	/** @param {string} relative */
	const walk = (relative) => {
		for (const entry of fs.readdirSync(path.join(root, relative), {
			withFileTypes: true,
		})) {
			const child = `${relative}/${entry.name}`;
			if (entry.isDirectory()) {
				walk(child);
			} else if (
				entry.name.endsWith(".tsx") &&
				!entry.name.endsWith(".stories.tsx")
			) {
				note(entry.name.slice(0, -".tsx".length));
			}
		}
	};
	walk("src/renderer/components");
	if (fs.existsSync(path.join(root, "src/renderer/App.tsx"))) {
		note("App");
	}
	const ids = [...seen.keys()].sort(compareCodeUnits);
	const collisions = ids.filter((id) => (seen.get(id) ?? 0) > 1);
	return { ids, collisions };
}

/**
 * @param {unknown} doc
 */
function shapeProblems(doc) {
	if (!Array.isArray(doc)) {
		return [problem("not-array", "subjects.json must be a bare array")];
	}
	const found = [];
	const ids = [];
	for (const [index, entry] of doc.entries()) {
		const where = `subject ${index}`;
		if (!isPlainObject(entry)) {
			found.push(problem("not-object", `${where} must be an object`));
			continue;
		}
		found.push(...closedKeys(entry, ["id", "tier"], [], where));
		const id = entry["id"];
		if (typeof id !== "string" || !SUBJECT_ID_PATTERN.test(id)) {
			found.push(problem("bad-id", `${where} id must be PascalCase`));
		} else {
			ids.push(id);
		}
		if (
			Object.hasOwn(entry, "tier") &&
			!TIERS.includes(/** @type {string} */ (entry["tier"]))
		) {
			found.push(
				problem(
					"bad-tier",
					`${where} tier must be one of ${TIERS.join(", ")}`,
					typeof id === "string" ? { id } : {},
				),
			);
		}
	}
	const seen = new Set();
	for (const id of ids) {
		if (seen.has(id)) {
			found.push(
				problem("duplicate-id", `subject ${id} is listed twice`, { id }),
			);
		}
		seen.add(id);
	}
	const sorted = [...ids].sort(compareCodeUnits);
	if (found.length === 0 && ids.some((id, index) => id !== sorted[index])) {
		found.push(problem("unsorted", "subjects.json must be sorted by id"));
	}
	return found;
}

/**
 * @param {unknown} doc
 * @param {{ ids: readonly string[], collisions: readonly string[] }} scan
 */
export function validateSubjects(doc, scan) {
	const shape = shapeProblems(doc);
	if (shape.length > 0) return sortProblems(shape);
	const listed = new Set(
		/** @type {Array<{ id: string }>} */ (doc).map((entry) => entry.id),
	);
	const scanned = new Set(scan.ids);
	const found = [];
	for (const id of scan.ids) {
		if (!listed.has(id)) {
			found.push(
				problem(
					"subject-unregistered",
					`component ${id} has no row in subjects.json; add {id, tier}`,
					{ id },
				),
			);
		}
	}
	for (const id of listed) {
		if (!scanned.has(id)) {
			found.push(
				problem(
					"subject-stale",
					`subjects.json lists ${id} but no component file has that name`,
					{ id },
				),
			);
		}
	}
	for (const id of scan.collisions) {
		found.push(
			problem(
				"subject-collision",
				`two component files share the basename ${id}`,
				{ id },
			),
		);
	}
	return sortProblems(found);
}

/**
 * Subject id to tier. Throws on any problem, like loadCatalog.
 *
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function loadSubjects(root) {
	const doc = readJson(root, SUBJECTS_PATH);
	const problems = validateSubjects(doc, scanSubjectIds(root));
	if (problems.length > 0) {
		const first = problems[0];
		throw new Error(`${first?.code}: ${first?.message}`);
	}
	return new Map(
		/** @type {Array<{ id: string, tier: string }>} */ (doc).map((entry) => [
			entry.id,
			entry.tier,
		]),
	);
}
