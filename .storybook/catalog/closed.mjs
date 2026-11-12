// Shared closed-key and path helpers for the catalog tooling (Phase 71, D-02).
//
// Hand-rolled on purpose: no zod, no schema library. Validators built on these
// helpers return sorted `{ code, message, ... }` records, structure first and
// values second, so one planted defect yields one code.
import fs from "node:fs";
import path from "node:path";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function problem(code, message, extra = {}) {
	return { ...extra, code, message };
}

/**
 * Closed key set: every key must be required or optional, every required key
 * must be present.
 *
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} required
 * @param {readonly string[]} optional
 * @param {string} where
 */
export function closedKeys(obj, required, optional, where) {
	const problems = [];
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(obj)) {
		if (!allowed.has(key)) {
			problems.push(
				problem("unknown-field", `${where} has unknown key ${key}`),
			);
		}
	}
	for (const key of required) {
		if (!Object.hasOwn(obj, key)) {
			problems.push(problem("missing-field", `${where} is missing ${key}`));
		}
	}
	return problems;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isNonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * `YYYY-MM-DD` that survives a UTC round trip, so `2026-02-30` is false.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function isCalendarDate(text) {
	if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return false;
	}
	const [year, month, day] = text.split("-").map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return false;
	}
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/**
 * Resolve a repo-relative path inside `root`, or return null. The rejection
 * set follows scripts/known_gap_gate.mjs `hasInvalidPathSyntax` plus NUL and
 * `..` segments, then re-checks that the resolved path stays under the root.
 *
 * @param {string} root
 * @param {unknown} relPath
 * @returns {string | null}
 */
export function resolveInRoot(root, relPath) {
	if (typeof relPath !== "string" || relPath === "") {
		return null;
	}
	if (
		relPath.startsWith("/") ||
		relPath.includes("\\") ||
		relPath.includes("\0") ||
		relPath.includes(":") ||
		/[*?[\]{}]/.test(relPath) ||
		relPath.split("/").includes("..")
	) {
		return null;
	}
	const resolved = path.resolve(root, relPath);
	const relative = path.relative(root, resolved);
	if (
		relative === "" ||
		relative.startsWith("..") ||
		path.isAbsolute(relative)
	) {
		return null;
	}
	return resolved;
}

/**
 * @param {string} root
 * @param {string} relPath
 * @returns {unknown}
 */
export function readJson(root, relPath) {
	try {
		return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
	} catch (error) {
		throw new Error(
			`${relPath} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * The authored-JSON form: tabs, LF, one trailing newline, no timestamps.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

/**
 * Code-unit order, never locale collation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareCodeUnits(a, b) {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * @template {{ code: string, message: string, id?: string | undefined }} T
 * @param {readonly T[]} problems
 * @returns {T[]}
 */
export function sortProblems(problems) {
	return [...problems].sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.id ?? "", b.id ?? "") ||
			compareCodeUnits(a.message, b.message),
	);
}
