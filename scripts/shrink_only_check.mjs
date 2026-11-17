// Shrink-only check for the Phase 76 gate data files (GAT-01, GAT-03, D-10).
//
//   node scripts/shrink_only_check.mjs [--base <ref>]
//
// Two data files let a gate stay green while a known debt exists: the GAT-01 pending list
// (tests/renderer/gates/token_drift_pending.json, token rows whose value still differs from
// the brand) and the GAT-03 colour baseline (docs/evidence/colour-literals.json, colour
// literals that still sit outside tokens.css). Each may only shrink. A pull request that
// added a row in the same change as the regression it excuses would turn the gate off for that
// regression, and a committed count that the same change can edit proves nothing (D-10
// rejected it), so each file is compared with its copy at the merge-base of HEAD and the base
// ref (`--base`, else origin/<GITHUB_BASE_REF>, else origin/master):
//   - a key the merge-base copy lacks is `added`;
//   - a value above the merge-base value for a key is `raised` (a duplicated row sums, so a
//     repeat cannot hide an addition);
//   - a head file that is gone while the merge-base has it is `deleted`;
//   - a file absent at the merge-base is the one admitted bootstrap: the first pull request
//     that adds it.
// GAT-03 has exactly two source-owned additions for BrowserWindow's first-paint ground; the
// unchanged GAT-02 test independently checks those values against tokens.css in both themes.
// They are listed as exact one-count approvedAdditions on that registry entry. No other key,
// file, value, or count is exempt from the shrink-only comparison.
// A missing base ref fails closed (exit 1), never a pass. The comparison (`shrinkOnlyProblems`)
// is pure and unit-tested with planted documents; only `main` reads git, so `yarn test` stays
// hermetic on a clone without origin/master (RESEARCH R8). The CLI is the last command of the
// ci.yml step `Brand pin, quote and drift gates`.
import fs from "node:fs";
import path from "node:path";
import {
	readMergeBase,
	resolveBaseRef,
} from "../.storybook/catalog/merge_base.mjs";
import { isMainModule } from "./is_main_module.mjs";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} doc
 * @returns {unknown[] | null} the document's `rows` array, or null when it has none
 */
function documentRows(doc) {
	return isRecord(doc) && Array.isArray(doc["rows"]) ? doc["rows"] : null;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} fields
 * @returns {string} the fields joined with `|`, or "" when one is not a string
 */
function joinedKey(row, fields) {
	const parts = fields.map((field) => row[field]);
	return parts.every((part) => typeof part === "string" && part !== "")
		? parts.join("|")
		: "";
}

export const SHRINK_ONLY_REGISTRY = Object.freeze([
	Object.freeze({
		id: "GAT-01 pending",
		path: "tests/renderer/gates/token_drift_pending.json",
		rows: documentRows,
		keyOf: (/** @type {Record<string, unknown>} */ row) =>
			joinedKey(row, ["token", "theme"]),
		valueOf: () => 1,
	}),
	Object.freeze({
		id: "GAT-03 baseline",
		path: "docs/evidence/colour-literals.json",
		rows: documentRows,
		keyOf: (/** @type {Record<string, unknown>} */ row) =>
			joinedKey(row, ["file", "literal"]),
		valueOf: (/** @type {Record<string, unknown>} */ row) =>
			typeof row["count"] === "number" ? row["count"] : 0,
		// BrowserWindow must paint the same two pinned theme grounds before CSS loads.
		// GAT-02 independently compares these exact values with tokens.css in both themes;
		// permit only these one-count rows when they replace the older grounds at merge-base.
		approvedAdditions: Object.freeze({
			"src/main/window/window_background.ts|#0a2e2b": 1,
			"src/main/window/window_background.ts|#ffffff": 1,
		}),
	}),
]);

/**
 * @typedef {typeof SHRINK_ONLY_REGISTRY[number]} Entry
 */

/**
 * The key to summed value of a document's rows, or null when the document or a row is
 * malformed (no rows array, a row that is not an object, an empty key, a non-positive value).
 *
 * @param {Entry} entry
 * @param {unknown} doc
 * @returns {Map<string, number> | null}
 */
function keyedValues(entry, doc) {
	const rows = entry.rows(doc);
	if (rows === null) return null;
	/** @type {Map<string, number>} */
	const values = new Map();
	for (const row of rows) {
		if (!isRecord(row)) return null;
		const key = entry.keyOf(row);
		const value = entry.valueOf(row);
		if (key === "" || !Number.isFinite(value) || value <= 0) return null;
		values.set(key, (values.get(key) ?? 0) + value);
	}
	return values;
}

/**
 * @param {{ entry: Entry, head: unknown, base: unknown }} subject `head` is null when the head
 *   file is absent; `base` is null when the file is absent at the merge-base
 * @returns {Array<{ code: string, key: string, message: string }>}
 */
export function shrinkOnlyProblems({ entry, head, base }) {
	if (base === null || base === undefined) return [];
	if (head === null || head === undefined) {
		return [
			{
				code: "deleted",
				key: entry.path,
				message: `${entry.path} exists at the merge-base and is gone; the file may shrink but not disappear`,
			},
		];
	}
	const baseValues = keyedValues(entry, base);
	if (baseValues === null) {
		return [
			{
				code: "malformed",
				key: entry.path,
				message: `${entry.path} at the merge-base has no usable { rows } array`,
			},
		];
	}
	const headValues = keyedValues(entry, head);
	if (headValues === null) {
		return [
			{
				code: "malformed",
				key: entry.path,
				message: `${entry.path} has no usable { rows } array (every row needs its key fields and a positive value)`,
			},
		];
	}
	/** @type {Array<{ code: string, key: string, message: string }>} */
	const problems = [];
	for (const [key, value] of headValues) {
		const before = baseValues.get(key);
		if (before === undefined) {
			if (entry.approvedAdditions?.[key] === value) continue;
			problems.push({
				code: "added",
				key,
				message: `${entry.id}: ${key} is new against the merge-base; this list may only shrink`,
			});
		} else if (value > before) {
			problems.push({
				code: "raised",
				key,
				message: `${entry.id}: ${key} is ${value} and was ${before} at the merge-base; this list may only shrink`,
			});
		}
	}
	return problems;
}

/**
 * @param {string[]} argv
 * @returns {{ base: string | undefined }}
 */
function parseArguments(argv) {
	/** @type {string | undefined} */
	let base;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--base") {
			base = argv[index + 1];
			if (base === undefined || base === "" || base.startsWith("--")) {
				throw new Error("--base needs a ref");
			}
			index += 1;
		} else {
			throw new Error(`unknown argument: ${argument}`);
		}
	}
	return { base };
}

/**
 * @param {string} root
 * @param {string} relPath
 * @returns {unknown} the parsed JSON, or null when the file is absent
 */
function readHead(root, relPath) {
	const target = path.join(root, relPath);
	if (!fs.existsSync(target)) return null;
	try {
		return JSON.parse(fs.readFileSync(target, "utf8"));
	} catch (error) {
		throw new Error(
			`${relPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * @param {string[]} argv
 * @param {{ root?: string | undefined, readBase?: typeof readMergeBase | undefined }} [options]
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2), options = {}) {
	try {
		const root = options.root ?? process.cwd();
		const readBase = options.readBase ?? readMergeBase;
		const { base: explicit } = parseArguments(argv);
		const ref = resolveBaseRef(explicit, process.env);
		let failed = false;
		for (const entry of SHRINK_ONLY_REGISTRY) {
			const { base } = readBase(entry.path, { ref, cwd: root });
			const problems = shrinkOnlyProblems({
				entry,
				head: readHead(root, entry.path),
				base,
			});
			if (problems.length > 0) {
				failed = true;
				for (const problem of problems) {
					console.error(
						`✗ SHRINK-ONLY FAILED ${entry.id}: ${problem.code}: ${problem.message}`,
					);
				}
			} else {
				console.log(
					`SHRINK-ONLY OK ${entry.id}${base === null ? " (bootstrap)" : ""}`,
				);
			}
		}
		return failed ? 1 : 0;
	} catch (error) {
		console.error(
			`✗ SHRINK-ONLY FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
