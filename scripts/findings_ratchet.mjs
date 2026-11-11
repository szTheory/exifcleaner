// Shrink-only ratchet for the Storybook findings baseline (SBK-05, D-29).
//
// docs/evidence/known-findings.json lists accepted findings (for example an
// axe rule a story is known to violate). The ratchet compares the working copy
// with the copy at the merge-base and lets the list only shrink.
//
// Admissible routes
//   - An entry in a kind that already exists at the merge-base can only be
//     removed. `--write` prunes entries whose story left the catalog (stale);
//     it never adds anything.
//   - A story that exposes a new violation is fixed in the story, or recorded
//     by introducing a NEW kind together with its entries in the first change
//     that creates it, declared `"sealed": true`. From the next change on that
//     kind exists at the merge-base, so it shrinks like any other kind: adding
//     a second entry is rejected as `added`. A new kind declared
//     `"sealed": false` is rejected as `new-kind-unsealed`.
//   - Kinds named `a11y` or `a11y-<suffix>` are read by `knownA11y` in
//     .storybook/a11y_known.ts to disable an axe rule for one story.
//   - There is no reseed or re-admission path. Changing these rules is a
//     separate change from any baseline data (D-29).
//
// A merge-base that has no baseline file (the Phase 70 bootstrap) counts as
// "no kinds, no entries", so every kind in the head is newly introduced.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_PATH = "docs/evidence/known-findings.json";

const TOP_LEVEL_KEYS = ["schemaVersion", "kinds", "entries"];
const ENTRY_REQUIRED = ["fingerprint", "kind", "story", "rule", "reason"];
const ENTRY_KEYS = new Set([...ENTRY_REQUIRED, "disposition"]);

function isPlainObject(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function problem(code, message) {
	return { code, message };
}

/**
 * @param {string} kind
 * @param {...string} parts
 * @returns {string}
 */
export function fingerprint(kind, ...parts) {
	return [kind, ...parts].join("|");
}

/**
 * Strict structural validation (known_gap_gate.mjs style: closed key sets).
 *
 * @param {unknown} doc
 * @returns {{code: string, message: string}[]}
 */
export function validateBaseline(doc) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "baseline must be a JSON object")];
	}
	const problems = [];
	for (const key of Object.keys(doc)) {
		if (!TOP_LEVEL_KEYS.includes(key)) {
			problems.push(problem("unknown-field", `unknown top-level field ${key}`));
		}
	}
	if (doc.schemaVersion !== 1) {
		problems.push(problem("schema-version", "schemaVersion must be 1"));
	}
	const kinds = isPlainObject(doc.kinds) ? doc.kinds : undefined;
	if (kinds === undefined) {
		problems.push(problem("kinds", "kinds must be an object"));
	} else {
		for (const [name, value] of Object.entries(kinds)) {
			if (
				!isPlainObject(value) ||
				Object.keys(value).length !== 1 ||
				typeof value.sealed !== "boolean"
			) {
				problems.push(
					problem(
						"kind-shape",
						`kind ${name} must be exactly { sealed: boolean }`,
					),
				);
			}
		}
	}
	if (!Array.isArray(doc.entries)) {
		problems.push(problem("entries", "entries must be an array"));
		return problems;
	}
	const seen = new Set();
	doc.entries.forEach((entry, index) => {
		const where = `entries[${index}]`;
		if (!isPlainObject(entry)) {
			problems.push(problem("entry-shape", `${where} must be an object`));
			return;
		}
		for (const key of Object.keys(entry)) {
			if (!ENTRY_KEYS.has(key)) {
				problems.push(
					problem("entry-field", `${where} has unknown key ${key}`),
				);
			}
		}
		let complete = true;
		for (const key of ENTRY_REQUIRED) {
			const value = entry[key];
			if (typeof value !== "string" || value === "") {
				problems.push(
					problem("entry-field", `${where}.${key} must be a non-empty string`),
				);
				complete = false;
			}
		}
		if (
			"disposition" in entry &&
			(typeof entry.disposition !== "string" || entry.disposition === "")
		) {
			problems.push(
				problem(
					"entry-field",
					`${where}.disposition must be a non-empty string`,
				),
			);
		}
		if (!complete) return;
		if (kinds !== undefined && !Object.hasOwn(kinds, entry.kind)) {
			problems.push(
				problem(
					"undeclared-kind",
					`${where} uses kind ${entry.kind}, which is not declared in kinds`,
				),
			);
		}
		const expected = fingerprint(entry.kind, entry.story, entry.rule);
		if (entry.fingerprint !== expected) {
			problems.push(
				problem(
					"fingerprint-mismatch",
					`${where}.fingerprint ${entry.fingerprint} must equal ${expected}`,
				),
			);
		}
		if (seen.has(entry.fingerprint)) {
			problems.push(
				problem(
					"duplicate",
					`${where} repeats fingerprint ${entry.fingerprint}`,
				),
			);
		}
		seen.add(entry.fingerprint);
	});
	return problems;
}

function entriesOf(doc) {
	return doc !== null && doc !== undefined && Array.isArray(doc.entries)
		? doc.entries
		: [];
}

/**
 * @param {object | null} base the merge-base document (null when absent)
 * @param {object} head the working document
 * @returns {{added: object[], removed: object[]}}
 */
export function diffBaseline(base, head) {
	const baseKeys = new Set(entriesOf(base).map((entry) => entry.fingerprint));
	const headKeys = new Set(entriesOf(head).map((entry) => entry.fingerprint));
	return {
		added: entriesOf(head).filter((entry) => !baseKeys.has(entry.fingerprint)),
		removed: entriesOf(base).filter(
			(entry) => !headKeys.has(entry.fingerprint),
		),
	};
}

/**
 * @param {{head: object, base: object | null, observed?: Set<string>}} subject
 *   base null means the file is absent at the merge-base; observed is the set
 *   of story ids in the built catalog (omit to skip the stale check).
 * @returns {{ok: boolean, problems: {code: string, message: string}[]}}
 */
export function check({ head, base, observed }) {
	const problems = validateBaseline(head);
	if (base !== null && base !== undefined) {
		for (const found of validateBaseline(base)) {
			problems.push(
				problem("base-invalid", `merge-base copy: ${found.message}`),
			);
		}
	}
	if (problems.length > 0) return { ok: false, problems };

	const baseKinds = base ? base.kinds : {};
	const headKinds = head.kinds;
	for (const [name, value] of Object.entries(baseKinds)) {
		if (!Object.hasOwn(headKinds, name)) {
			problems.push(
				problem(
					"kind-removed",
					`kind ${name} exists at the merge-base and was removed`,
				),
			);
		} else if (value.sealed && !headKinds[name].sealed) {
			problems.push(
				problem("unsealed", `kind ${name} was sealed at the merge-base`),
			);
		}
	}
	for (const [name, value] of Object.entries(headKinds)) {
		if (!Object.hasOwn(baseKinds, name) && value.sealed !== true) {
			problems.push(
				problem(
					"new-kind-unsealed",
					`kind ${name} is newly introduced and must be declared sealed: true`,
				),
			);
		}
	}
	for (const entry of diffBaseline(base, head).added) {
		if (Object.hasOwn(baseKinds, entry.kind)) {
			problems.push(
				problem(
					"added",
					`entry ${entry.fingerprint} was added to kind ${entry.kind}, which exists at the merge-base; the baseline may only shrink`,
				),
			);
		}
	}
	if (observed !== undefined) {
		for (const entry of head.entries) {
			if (!observed.has(entry.story)) {
				problems.push(
					problem(
						"stale",
						`entry ${entry.fingerprint} names story ${entry.story}, which is not in the catalog (run --write to prune)`,
					),
				);
			}
		}
	}
	return { ok: problems.length === 0, problems };
}

/**
 * Removes stale entries only. Refuses when anything other than staleness is
 * wrong (an addition, a malformed baseline).
 *
 * @param {{head: object, base: object | null, observed: Set<string>}} subject
 * @returns {{ok: true, doc: object} | {ok: false, problems: {code: string, message: string}[]}}
 */
export function prune({ head, base, observed }) {
	const result = check({ head, base, observed });
	const blocking = result.problems.filter((found) => found.code !== "stale");
	if (blocking.length > 0) return { ok: false, problems: blocking };
	return {
		ok: true,
		doc: {
			...head,
			entries: head.entries.filter((entry) => observed.has(entry.story)),
		},
	};
}

function gitText(args) {
	return execFileSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function readBase(ref) {
	const mergeBase = gitText(["merge-base", "HEAD", ref]).trim();
	const listed = gitText(["ls-tree", mergeBase, "--", BASELINE_PATH]).trim();
	if (listed === "") return { mergeBase, base: null };
	return {
		mergeBase,
		base: JSON.parse(gitText(["show", `${mergeBase}:${BASELINE_PATH}`])),
	};
}

function storyIdsFromIndex(indexPath) {
	if (!fs.existsSync(indexPath)) {
		throw new Error(`${indexPath} not found: build the catalog first`);
	}
	const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	if (!isPlainObject(index) || !isPlainObject(index.entries)) {
		throw new Error(`${indexPath} has no entries object`);
	}
	return new Set(
		Object.values(index.entries)
			.filter((entry) => isPlainObject(entry) && entry.type === "story")
			.map((entry) => entry.id),
	);
}

function parseArguments(argv) {
	const flags = new Set();
	const values = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--index" || arg === "--base") {
			values.set(arg, argv[index + 1]);
			index += 1;
		} else {
			flags.add(arg);
		}
	}
	return { flags, values };
}

function describeProblems(problems) {
	return problems.map((found) => `${found.code}: ${found.message}`).join("; ");
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2)) {
	try {
		const { flags, values } = parseArguments(argv);
		const writing = flags.has("--write");
		if (writing === flags.has("--check")) {
			throw new Error("pass exactly one of --check or --write");
		}
		const indexPath = values.get("--index");
		if (writing && indexPath === undefined) {
			throw new Error("--write requires --index <storybook index.json>");
		}
		const observed =
			indexPath === undefined
				? undefined
				: storyIdsFromIndex(path.resolve(process.cwd(), indexPath));
		const ref =
			values.get("--base") ??
			(process.env["GITHUB_BASE_REF"]
				? `origin/${process.env["GITHUB_BASE_REF"]}`
				: "origin/master");
		const { mergeBase, base } = readBase(ref);
		const baselineFile = path.join(process.cwd(), BASELINE_PATH);
		const head = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

		if (writing) {
			const result = prune({ head, base, observed });
			if (!result.ok) {
				console.error(
					`✗ FINDINGS RATCHET FAILED: refusing to write: ${describeProblems(result.problems)}`,
				);
				return 1;
			}
			const before = head.entries.length;
			const after = result.doc.entries.length;
			if (after !== before) {
				fs.writeFileSync(
					baselineFile,
					`${JSON.stringify(result.doc, null, "\t")}\n`,
				);
			}
			console.log(
				`✓ FINDINGS RATCHET PASSED — pruned ${before - after} stale entries`,
			);
			return 0;
		}

		const result = check({ head, base, ...(observed ? { observed } : {}) });
		if (!result.ok) {
			console.error(
				`✗ FINDINGS RATCHET FAILED: ${describeProblems(result.problems)}`,
			);
			return 1;
		}
		console.log(
			`✓ FINDINGS RATCHET PASSED — ${head.entries.length} entries, merge-base ${base === null ? "has no baseline (bootstrap)" : mergeBase.slice(0, 7)}`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ FINDINGS RATCHET FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
