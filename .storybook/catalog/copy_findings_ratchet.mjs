// Shrink-only register of copy deviations (Phase 71, LANG-02 and LANG-03, D-13).
//
// .storybook/catalog/copy-findings.json is at once the LANG-02 baseline (a
// string the brand lint flags today) and the LANG-03 deviation list (every
// place the product's words differ from the glossary, with a disposition and a
// reason). The ratchet compares the working copy with the copy at the
// merge-base and lets the list only shrink:
//   - an entry absent at the merge-base is `added` and rejected;
//   - a deviation the detectors observe but the register does not list is
//     `unlisted`;
//   - an entry whose detector no longer fires, or whose literal left its file,
//     is `stale` and `--write` removes it (and only it).
// There is no reseed path. This is a copy and adaptation of
// scripts/findings_ratchet.mjs, which stays untouched and is not imported.
// `--write` edits this authored register by design (D-13, the ratified D-03
// scope note limits "never edits an authored JSON" to catalog.mjs).
import fs from "node:fs";
import path from "node:path";
import { isMainModule } from "../../scripts/is_main_module.mjs";
import {
	canonicalJson,
	closedKeys,
	compareCodeUnits,
	isNonEmptyString,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
} from "./closed.mjs";
import { buildRuleset, lintText } from "./copy_lint.mjs";
import { GLOSSARY_PATH } from "./glossary.mjs";
import { scanRenderer, uniquePairs } from "./hardcoded_scan.mjs";
import { readMergeBase, resolveBaseRef } from "./merge_base.mjs";
import {
	DISPOSITIONS,
	FINDING_KINDS,
	FINDING_SURFACES,
	TERM_ID_PATTERN,
} from "./vocab.mjs";

export const COPY_FINDINGS_PATH = ".storybook/catalog/copy-findings.json";

const RULES_PATH = ".storybook/catalog/copy_lint_rules.json";
const EN_PATH = ".resources/locales/en.json";

const ENTRY_KEYS = [
	"fingerprint",
	"kind",
	"surface",
	"ref",
	"text",
	"disposition",
	"reason",
];

// Every code the module can report: the validation codes, then the codes a
// comparison against the merge-base and the detectors adds.
export const COPY_FINDINGS_CODES = Object.freeze([
	"not-object",
	"schema-version",
	"unknown-field",
	"missing-field",
	"bad-kind",
	"bad-surface",
	"bad-disposition",
	"empty-reason",
	"bad-fingerprint",
	"duplicate",
	"unsorted",
	"base-invalid",
	"added",
	"unlisted",
	"stale",
]);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Per-kind fingerprint formats, `|`-joined, never a line number:
 *   vocab    vocab|<termId>|<word>|en:<key>
 *   banned   banned|<ruleId>|en:<key>
 *   name     name|<ruleId>|en:<key>
 *   hardcoded hardcoded|src:<path>|<literal>
 *   main     main|src:<path>|<literal>
 *   manual   manual|<kebab-slug>
 *
 * @param {string} kind
 * @param {readonly string[]} parts
 * @returns {string}
 */
export function fingerprintFor(kind, parts) {
	const arity = {
		vocab: 3,
		banned: 2,
		name: 2,
		hardcoded: 2,
		main: 2,
		manual: 1,
	}[kind];
	if (arity === undefined) {
		throw new Error(`unknown finding kind ${kind}`);
	}
	if (parts.length !== arity) {
		throw new Error(`${kind} fingerprints take ${arity} parts`);
	}
	return [kind, ...parts].join("|");
}

function isRef(ref, prefix) {
	if (typeof ref !== "string" || !ref.startsWith(prefix)) return false;
	const rest = ref.slice(prefix.length);
	if (rest === "") return false;
	// A `src:` path must be a clean repo-relative path (no `..`, no absolute).
	return prefix === "src:" ? resolveInRoot("/repo", rest) !== null : true;
}

// The fingerprint an entry's kind, ref and text imply, as a message when it
// does not match.
function fingerprintProblem(entry) {
	const { kind, ref, text, fingerprint } = entry;
	if (kind === "vocab") {
		const found = /^vocab\|([^|]+)\|([^|]+)\|(.+)$/.exec(fingerprint);
		if (
			found === null ||
			!TERM_ID_PATTERN.test(found[1] ?? "") ||
			found[3] !== ref ||
			!isRef(ref, "en:")
		) {
			return "vocab|<termId>|<word>|en:<key> with the entry's own ref";
		}
	} else if (kind === "banned" || kind === "name") {
		const found = new RegExp(`^${kind}\\|(${kind}\\.[a-z0-9-]+)\\|(.+)$`).exec(
			fingerprint,
		);
		if (found === null || found[2] !== ref || !isRef(ref, "en:")) {
			return `${kind}|${kind}.<id>|en:<key> with the entry's own ref`;
		}
	} else if (kind === "hardcoded" || kind === "main") {
		if (fingerprint !== `${kind}|${ref}|${text}` || !isRef(ref, "src:")) {
			return `${kind}|src:<path>|<literal> with the entry's own ref and text`;
		}
	} else if (kind === "manual") {
		const found = /^manual\|(.+)$/.exec(fingerprint);
		if (
			found === null ||
			!SLUG.test(found[1] ?? "") ||
			!(isRef(ref, "en:") || isRef(ref, "src:"))
		) {
			return "manual|<kebab-slug> with an en: or src: ref";
		}
	}
	return null;
}

/**
 * Closed-key and value validation. Structure first, values second, then
 * duplicates and order. Problems come back sorted by code, then fingerprint.
 *
 * @param {unknown} doc
 */
export function validateRegister(doc) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "the register is not an object")];
	}
	const found = closedKeys(doc, ["schemaVersion", "entries"], [], "register");
	if (Object.hasOwn(doc, "schemaVersion") && doc["schemaVersion"] !== 1) {
		found.push(problem("schema-version", "schemaVersion must be 1"));
	}
	const entries = doc["entries"];
	if (Object.hasOwn(doc, "entries") && !Array.isArray(entries)) {
		found.push(problem("not-object", "entries must be a list"));
	}
	if (Array.isArray(entries)) {
		const seen = new Set();
		let previous = null;
		let reportedOrder = false;
		entries.forEach((entry, index) => {
			if (!isPlainObject(entry)) {
				found.push(problem("not-object", `entry #${index} is not an object`));
				return;
			}
			const where =
				typeof entry["fingerprint"] === "string"
					? `entry ${entry["fingerprint"]}`
					: `entry #${index}`;
			const id =
				typeof entry["fingerprint"] === "string"
					? entry["fingerprint"]
					: undefined;
			const add = (code, message) =>
				found.push(problem(code, message, id === undefined ? {} : { id }));
			for (const issue of closedKeys(entry, ENTRY_KEYS, [], where)) {
				add(issue.code, issue.message);
			}
			const enums = [
				["kind", FINDING_KINDS, "bad-kind"],
				["surface", FINDING_SURFACES, "bad-surface"],
				["disposition", DISPOSITIONS, "bad-disposition"],
			];
			for (const [key, allowed, code] of enums) {
				if (Object.hasOwn(entry, key) && !allowed.includes(entry[key])) {
					add(code, `${where}: ${key} must be one of ${allowed.join(", ")}`);
				}
			}
			if (
				Object.hasOwn(entry, "reason") &&
				!isNonEmptyString(entry["reason"])
			) {
				add("empty-reason", `${where}: reason must be a non-empty string`);
			}
			for (const key of ["fingerprint", "ref", "text"]) {
				if (Object.hasOwn(entry, key) && !isNonEmptyString(entry[key])) {
					add("bad-fingerprint", `${where}: ${key} must be a non-empty string`);
				}
			}
			if (
				FINDING_KINDS.includes(entry["kind"]) &&
				isNonEmptyString(entry["fingerprint"]) &&
				isNonEmptyString(entry["ref"]) &&
				isNonEmptyString(entry["text"])
			) {
				const expected = fingerprintProblem(entry);
				if (expected !== null) {
					add("bad-fingerprint", `${where}: fingerprint must be ${expected}`);
				}
			}
			if (typeof entry["fingerprint"] === "string") {
				if (seen.has(entry["fingerprint"])) {
					add("duplicate", `${where} appears twice`);
				}
				seen.add(entry["fingerprint"]);
				if (
					previous !== null &&
					!reportedOrder &&
					compareCodeUnits(previous, entry["fingerprint"]) > 0
				) {
					add("unsorted", `${where} is out of order; sort by fingerprint`);
					reportedOrder = true;
				}
				previous = entry["fingerprint"];
			}
		});
	}
	return sortProblems(found);
}

function classify(ruleId) {
	if (ruleId.startsWith("vocab|")) {
		const [, termId, word] = ruleId.split("|");
		return { kind: "vocab", parts: [termId, word] };
	}
	if (ruleId.startsWith("banned.")) return { kind: "banned", parts: [ruleId] };
	if (ruleId.startsWith("name.")) return { kind: "name", parts: [ruleId] };
	throw new Error(`rule ${ruleId} has no finding kind`);
}

/**
 * Every deviation the detectors see: a lint hit on any en string, and every
 * hardcoded renderer (path, literal) pair. Sorted by fingerprint.
 *
 * @param {{ en: Record<string, string>, ruleset: any, pairs: Array<{ path: string, literal: string }> }} input
 */
export function observeDeviations({ en, ruleset, pairs }) {
	const observed = [];
	for (const [key, value] of Object.entries(en)) {
		for (const hit of lintText(value, ruleset)) {
			const { kind, parts } = classify(hit.ruleId);
			const ref = `en:${key}`;
			observed.push({
				fingerprint: fingerprintFor(kind, [...parts, ref]),
				kind,
				surface: "en",
				ref,
				text: value,
			});
		}
	}
	for (const pair of pairs) {
		const ref = `src:${pair.path}`;
		observed.push({
			fingerprint: fingerprintFor("hardcoded", [ref, pair.literal]),
			kind: "hardcoded",
			surface: "renderer",
			ref,
			text: pair.literal,
		});
	}
	return observed.sort((a, b) =>
		compareCodeUnits(a.fingerprint, b.fingerprint),
	);
}

/**
 * @param {{ en: Record<string, string>, ruleset: any, pairs: Array<{ path: string, literal: string }>, readText: (relPath: string) => string | null }} input
 */
export function observationFrom({ en, ruleset, pairs, readText }) {
	return { observed: observeDeviations({ en, ruleset, pairs }), en, readText };
}

/**
 * The observation of a working tree, every path resolved from `root`.
 *
 * @param {string} root
 */
export function loadObservation(root) {
	const en = /** @type {Record<string, string>} */ (readJson(root, EN_PATH));
	const ruleset = buildRuleset(
		readJson(root, RULES_PATH),
		readJson(root, GLOSSARY_PATH),
	);
	return observationFrom({
		en,
		ruleset,
		pairs: uniquePairs(scanRenderer(root)),
		readText(relPath) {
			const resolved = resolveInRoot(root, relPath);
			if (resolved === null) return null;
			try {
				return fs.readFileSync(resolved, "utf8");
			} catch {
				return null;
			}
		},
	});
}

function entryStale(entry, observation, observedKeys) {
	if (["vocab", "banned", "name", "hardcoded"].includes(entry.kind)) {
		return !observedKeys.has(entry.fingerprint);
	}
	if (entry.kind === "main" || entry.ref.startsWith("src:")) {
		const source = observation.readText(entry.ref.slice("src:".length));
		return source === null || !source.includes(entry.text);
	}
	const value = observation.en[entry.ref.slice("en:".length)];
	return typeof value !== "string" || !value.includes(entry.text);
}

/**
 * @param {{ head: unknown, base: unknown, observation: ReturnType<typeof observationFrom> }} subject
 *   base is null when the file is absent at the merge-base (the one bootstrap).
 * @returns {{ ok: boolean, problems: Array<{ code: string, message: string, id?: string }>, notes: string[] }}
 */
export function check({ head, base, observation }) {
	const problems = validateRegister(head);
	if (base !== null) {
		for (const found of validateRegister(base)) {
			problems.push(
				problem("base-invalid", `merge-base copy: ${found.message}`),
			);
		}
	}
	if (problems.length > 0) {
		return { ok: false, problems: sortProblems(problems), notes: [] };
	}
	const entries = /** @type {any} */ (head).entries;
	const headKeys = new Set(entries.map((entry) => entry.fingerprint));
	const observedKeys = new Set(observation.observed.map((o) => o.fingerprint));
	if (base !== null) {
		const baseKeys = new Set(
			/** @type {any} */ (base).entries.map((entry) => entry.fingerprint),
		);
		for (const entry of entries) {
			if (!baseKeys.has(entry.fingerprint)) {
				problems.push(
					problem(
						"added",
						`entry ${entry.fingerprint} was added; the register may only shrink`,
						{ id: entry.fingerprint },
					),
				);
			}
		}
	}
	for (const observed of observation.observed) {
		if (!headKeys.has(observed.fingerprint)) {
			problems.push(
				problem(
					"unlisted",
					`deviation ${observed.fingerprint} is not in the register`,
					{ id: observed.fingerprint },
				),
			);
		}
	}
	for (const entry of entries) {
		if (entryStale(entry, observation, observedKeys)) {
			problems.push(
				problem(
					"stale",
					`entry ${entry.fingerprint} no longer matches its detector or its source; run --write to remove it`,
					{ id: entry.fingerprint },
				),
			);
		}
	}
	return {
		ok: problems.length === 0,
		problems: sortProblems(problems),
		notes: base === null ? ["bootstrap"] : [],
	};
}

/**
 * Removes stale entries only. Refuses when anything other than staleness is
 * wrong (an addition, an unlisted deviation, a malformed register).
 *
 * @param {{ head: unknown, base: unknown, observation: ReturnType<typeof observationFrom> }} subject
 */
export function prune({ head, base, observation }) {
	const result = check({ head, base, observation });
	const blocking = result.problems.filter((found) => found.code !== "stale");
	if (blocking.length > 0) {
		return { ok: false, problems: blocking };
	}
	const stale = new Set(
		result.problems.map((found) => found.id).filter((id) => id !== undefined),
	);
	const document = /** @type {any} */ (head);
	return {
		ok: true,
		doc: {
			...document,
			entries: document.entries.filter(
				(entry) => !stale.has(entry.fingerprint),
			),
		},
	};
}

function parseArguments(argv) {
	const flags = new Set();
	let base;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--base") {
			base = argv[index + 1];
			if (base === undefined || base.startsWith("--")) {
				throw new Error("--base needs a ref");
			}
			index += 1;
		} else if (arg === "--check" || arg === "--write") {
			flags.add(arg);
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	return { flags, base };
}

function describe(problems) {
	return problems.map((found) => `${found.code}: ${found.message}`).join("; ");
}

function entryCount(doc) {
	return /** @type {any} */ (doc).entries.length;
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv = process.argv.slice(2)) {
	try {
		const { flags, base: explicitBase } = parseArguments(argv);
		const writing = flags.has("--write");
		if (writing === flags.has("--check")) {
			throw new Error("pass exactly one of --check or --write");
		}
		const root = process.cwd();
		const ref = resolveBaseRef(explicitBase, process.env);
		const { mergeBase, base } = readMergeBase(COPY_FINDINGS_PATH, {
			ref,
			cwd: root,
		});
		const head = readJson(root, COPY_FINDINGS_PATH);
		const observation = loadObservation(root);
		if (writing) {
			const result = prune({ head, base, observation });
			if (!result.ok) {
				console.error(
					`✗ COPY FINDINGS RATCHET FAILED: refusing to write: ${describe(result.problems)}`,
				);
				return 1;
			}
			const before = entryCount(head);
			const after = entryCount(result.doc);
			if (after !== before) {
				// One write of the whole canonical text: a crash cannot leave a
				// half-merged register that a later --check could mistake for valid.
				fs.writeFileSync(
					path.join(root, COPY_FINDINGS_PATH),
					canonicalJson(result.doc),
				);
			}
			console.log(
				`✓ COPY FINDINGS RATCHET PASSED — pruned ${before - after} stale entries`,
			);
			return 0;
		}
		const result = check({ head, base, observation });
		if (!result.ok) {
			console.error(
				`✗ COPY FINDINGS RATCHET FAILED: ${describe(result.problems)}`,
			);
			return 1;
		}
		console.log(
			`✓ COPY FINDINGS RATCHET PASSED — ${entryCount(head)} entries (${base === null ? "bootstrap" : `merge-base ${mergeBase.slice(0, 7)}`})`,
		);
		return 0;
	} catch (error) {
		console.error(
			`✗ COPY FINDINGS RATCHET FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

if (isMainModule(import.meta.url)) {
	process.exitCode = main();
}
