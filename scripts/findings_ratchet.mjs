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
//   - Kinds named `a11y` or `a11y-pN` are read by `knownA11y` in
//     .storybook/a11y_known.ts to disable an axe rule for one story.
//   - There is no reseed or re-admission path. Changing these rules is a
//     separate change from any baseline data (D-29).
//
// A merge-base that has no baseline file (the Phase 70 bootstrap) counts as
// "no kinds, no entries", so every kind in the head is newly introduced.
//
// The findings register (Phase 73, FLW-02, D-26 to D-30) is this same file and
// this same ratchet:
//   - The fingerprint `kind|story|rule` IS the finding id; story ids are frozen,
//     so a renamed story reads as `stale`, never as a silent re-key.
//   - Every entry carries a `disposition` (fix-v5.1, fix-v5.2, accept, reject).
//     Entries of a register kind also carry a `severity` (critical, major, minor)
//     and a kebab-slug `rule`. The kinds are a CLOSED list: the axe pattern
//     /^a11y(-p\d+)?$/ plus REGISTER_KINDS, so a later change cannot invent a kind
//     to add entries (`unknown-kind`); that includes an `a11y-` prefix outside the
//     pattern, which the a11y tests would read as an axe-disable kind.
//   - Disposition `reject` (not a defect, or a catalog artefact; the entry stays
//     listed and quiet) is valid only with a row of the optional top-level
//     `verdicts` log recording the maintainer's decision, and a merge-base row
//     can never be edited or removed. That log is the only way to silence a
//     finding.
//   - `--write` prunes stale entries of axe kinds only. A stale register entry
//     blocks it: a renamed or removed story must not silently delete a finding.
//   - check() validates the merge-base copy with the same validator, so every
//     field added here is optional at the top level (an absent `verdicts` counts
//     as []), and the copy on master, with no register kinds and no verdicts, stays
//     valid. Rules and data change in separate commits (70 D-29).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "./is_main_module.mjs";

export const BASELINE_PATH = "docs/evidence/known-findings.json";

const TOP_LEVEL_KEYS = ["schemaVersion", "kinds", "entries", "verdicts"];
const ENTRY_REQUIRED = [
	"fingerprint",
	"kind",
	"story",
	"rule",
	"reason",
	"disposition",
];
const ENTRY_KEYS = new Set([...ENTRY_REQUIRED, "severity"]);
const VERDICT_KEYS = [
	"fingerprint",
	"verdict",
	"reason",
	"decidedAt",
	"decidedBy",
	"reply",
];

// Inlined, never imported: this script stays standalone. A test pins DISPOSITIONS to
// .storybook/catalog/vocab.mjs, which owns the vocabulary.
export const DISPOSITIONS = Object.freeze([
	"fix-v5.1",
	"fix-v5.2",
	"accept",
	"reject",
]);

// By whose trust or access is affected: critical, the person is told something false,
// or nothing, about a result or failure; major, the job completes but a group is
// impaired; minor, cosmetic, latent or hygiene.
export const SEVERITIES = Object.freeze(["critical", "major", "minor"]);

// The closed list of hand-authored register kinds. A kind is declared only when it
// has an entry (an empty kind declared early is a sealed kind later).
export const REGISTER_KINDS = Object.freeze([
	"access-gap",
	"dead-end",
	"i18n-gap",
	"layout-gap",
	"silent-failure",
	"token-gap",
	"unrendered-outcome",
]);

// Axe kinds: `a11y` and one `a11y-pN` per phase. Their severity is derived (major) in
// the generated view, so the sealed entries are not rewritten to carry one.
export const AXE_KIND = /^a11y(-p\d+)?$/;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Every code this script can emit, so a test can pin one control to each.
export const FINDINGS_RATCHET_CODES = Object.freeze([
	"added",
	"bad-disposition",
	"bad-severity",
	"bad-slug",
	"base-invalid",
	"duplicate",
	"entries",
	"entry-field",
	"entry-shape",
	"fingerprint-mismatch",
	"kind-removed",
	"kind-shape",
	"kinds",
	"new-kind-unsealed",
	"not-object",
	"reject-unrecorded",
	"schema-version",
	"stale",
	"undeclared-kind",
	"unknown-field",
	"unknown-kind",
	"unsealed",
	"verdict-orphan",
	"verdict-rewritten",
	"verdict-shape",
]);

function isKnownKind(kind) {
	return AXE_KIND.test(kind) || REGISTER_KINDS.includes(kind);
}

// `YYYY-MM-DD` that survives a UTC round trip, so 2026-02-30 is false. A copy of
// isCalendarDate in .storybook/catalog/closed.mjs, for the same standalone reason.
function isCalendarDate(text) {
	if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return false;
	}
	const [year, month, day] = text.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

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
	// One unknown-kind per distinct name, wherever it first appears.
	const unknownReported = new Set();
	const reportUnknownKind = (name, where) => {
		if (isKnownKind(name) || unknownReported.has(name)) return;
		unknownReported.add(name);
		problems.push(
			problem(
				"unknown-kind",
				`${where} names kind ${name}, which is not allowed: a kind is the axe pattern a11y or a11y-pN, or one of ${REGISTER_KINDS.join(", ")}`,
			),
		);
	};
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
			reportUnknownKind(name, "kinds");
		}
	}
	if (!Array.isArray(doc.entries)) {
		problems.push(problem("entries", "entries must be an array"));
		return problems;
	}
	const seen = new Set();
	const rejected = new Set();
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
		if (!complete) return;
		if (kinds !== undefined && !Object.hasOwn(kinds, entry.kind)) {
			problems.push(
				problem(
					"undeclared-kind",
					`${where} uses kind ${entry.kind}, which is not declared in kinds`,
				),
			);
		}
		reportUnknownKind(entry.kind, where);
		if (!DISPOSITIONS.includes(entry.disposition)) {
			problems.push(
				problem(
					"bad-disposition",
					`${where}.disposition ${entry.disposition} must be one of ${DISPOSITIONS.join(", ")}`,
				),
			);
		}
		if (Object.hasOwn(entry, "severity")) {
			if (!SEVERITIES.includes(entry.severity)) {
				problems.push(
					problem(
						"bad-severity",
						`${where}.severity must be one of ${SEVERITIES.join(", ")}`,
					),
				);
			}
		} else if (REGISTER_KINDS.includes(entry.kind)) {
			problems.push(
				problem(
					"bad-severity",
					`${where} is a ${entry.kind} entry and needs a severity (${SEVERITIES.join(", ")})`,
				),
			);
		}
		if (REGISTER_KINDS.includes(entry.kind) && !SLUG.test(entry.rule)) {
			problems.push(
				problem(
					"bad-slug",
					`${where}.rule ${entry.rule} must be a kebab slug for a ${entry.kind} entry`,
				),
			);
		}
		if (entry.disposition === "reject") rejected.add(entry.fingerprint);
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
	problems.push(...validateVerdicts(doc, rejected));
	return problems;
}

/**
 * The verdict log: absent counts as []; closed rows; a `reject` entry needs its row
 * and a row needs its `reject` entry.
 *
 * @param {object} doc
 * @param {Set<string>} rejected fingerprints of the entries with disposition reject
 */
function validateVerdicts(doc, rejected) {
	const problems = [];
	const rows = Object.hasOwn(doc, "verdicts") ? doc.verdicts : [];
	if (!Array.isArray(rows)) {
		return [problem("verdict-shape", "verdicts must be an array")];
	}
	const recorded = new Set();
	rows.forEach((row, index) => {
		const where = `verdicts[${index}]`;
		if (!isPlainObject(row)) {
			problems.push(problem("verdict-shape", `${where} must be an object`));
			return;
		}
		for (const key of Object.keys(row)) {
			if (!VERDICT_KEYS.includes(key)) {
				problems.push(
					problem("verdict-shape", `${where} has unknown key ${key}`),
				);
			}
		}
		for (const key of VERDICT_KEYS) {
			if (key === "decidedAt") continue;
			const value = row[key];
			if (typeof value !== "string" || value.trim() === "") {
				problems.push(
					problem(
						"verdict-shape",
						`${where}.${key} must be a non-empty string`,
					),
				);
			}
		}
		if (row.verdict !== undefined && row.verdict !== "reject") {
			problems.push(
				problem("verdict-shape", `${where}.verdict must be reject`),
			);
		}
		if (row.decidedBy !== undefined && row.decidedBy !== "maintainer") {
			problems.push(
				problem("verdict-shape", `${where}.decidedBy must be maintainer`),
			);
		}
		if (!isCalendarDate(row.decidedAt)) {
			problems.push(
				problem(
					"verdict-shape",
					`${where}.decidedAt must be a calendar date YYYY-MM-DD`,
				),
			);
		}
		if (typeof row.fingerprint === "string" && row.fingerprint !== "") {
			if (recorded.has(row.fingerprint)) {
				problems.push(
					problem(
						"verdict-shape",
						`${where} repeats the verdict for ${row.fingerprint}`,
					),
				);
			}
			recorded.add(row.fingerprint);
		}
	});
	for (const fingerprint of rejected) {
		if (!recorded.has(fingerprint)) {
			problems.push(
				problem(
					"reject-unrecorded",
					`entry ${fingerprint} has disposition reject and no verdict row recording the maintainer's decision`,
				),
			);
		}
	}
	for (const fingerprint of recorded) {
		if (!rejected.has(fingerprint)) {
			problems.push(
				problem(
					"verdict-orphan",
					`verdict row ${fingerprint} has no entry with disposition reject`,
				),
			);
		}
	}
	return problems;
}

function entriesOf(doc) {
	return doc !== null && doc !== undefined && Array.isArray(doc.entries)
		? doc.entries
		: [];
}

function verdictsOf(doc) {
	return doc !== null && doc !== undefined && Array.isArray(doc.verdicts)
		? doc.verdicts
		: [];
}

function staleProblem(entry) {
	const rest = AXE_KIND.test(entry.kind)
		? "run --write to prune"
		: "register entries are never pruned: restore the story or remove the entry in a reviewed change";
	return problem(
		"stale",
		`entry ${entry.fingerprint} names story ${entry.story}, which is not in the catalog (${rest})`,
	);
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
	const headRows = new Map(
		verdictsOf(head).map((row) => [row.fingerprint, row]),
	);
	for (const row of verdictsOf(base)) {
		const now = headRows.get(row.fingerprint);
		if (
			now === undefined ||
			!VERDICT_KEYS.every((key) => now[key] === row[key])
		) {
			problems.push(
				problem(
					"verdict-rewritten",
					`verdict row ${row.fingerprint} exists at the merge-base and was ${now === undefined ? "removed" : "edited"} (recorded verdicts are permanent)`,
				),
			);
		}
	}
	if (observed !== undefined) {
		for (const entry of head.entries) {
			if (!observed.has(entry.story)) problems.push(staleProblem(entry));
		}
	}
	return { ok: problems.length === 0, problems };
}

/**
 * Removes stale entries of axe kinds only. Refuses when anything other than axe
 * staleness is wrong: an addition, a malformed baseline, or a stale register
 * entry (a renamed or removed story must not silently delete a finding).
 *
 * @param {{head: object, base: object | null, observed: Set<string>}} subject
 * @returns {{ok: true, doc: object} | {ok: false, problems: {code: string, message: string}[]}}
 */
export function prune({ head, base, observed }) {
	const result = check({ head, base, observed });
	const blocking = result.problems.filter((found) => found.code !== "stale");
	if (blocking.length > 0) return { ok: false, problems: blocking };
	const staleRegister = head.entries.filter(
		(entry) => !observed.has(entry.story) && !AXE_KIND.test(entry.kind),
	);
	if (staleRegister.length > 0) {
		return { ok: false, problems: staleRegister.map(staleProblem) };
	}
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

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
