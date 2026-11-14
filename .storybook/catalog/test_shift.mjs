// The test-shift ledger: which Playwright assertions moved to stories, and which stay (TST-01).
//
// One JSON file, .storybook/catalog/test-shift.json:
//   { schemaVersion: 1, baselineCommit, specs: { "<spec>": [ { title, items: [...] } ] } }
// The six spec keys are fixed (LEDGER_SPECS). One entry per test title, one item per lexical
// `expect(`, `expect.soft(` or `expect.poll(` call inside that test's callback, in source order.
// An item is { n, code, verdict, ... }: `code` is the normalized text of the whole matcher
// chain, `verdict` is `kept` (the assertion stays in the e2e spec, with a closed `reason`) or
// `deleted` (a story now holds it).
//
// What a `deleted` item honestly proves: the story id exists, the story's component is the
// item's subject, and the story's export source (plus the same-file helpers that export
// calls) contains the item's evidence literal. It does NOT prove the story passes (the
// Storybook light and dark projects prove that), and a literal's presence does not prove it
// belongs to the statement making the claim. TEST-SHIFT.md states both limits.
//
// This module is node only: it reaches node:fs and the typescript compiler. It is imported by
// storybook-node tests and by catalog.mjs. `checkTestShift` is pure: the ledger and the spec
// texts come in as parameters, structural problems return early so one planted defect yields
// one code, and lengths are UTF-16 code units.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import ts from "typescript";
import { readCsf } from "storybook/internal/csf-tools";
import {
	compareCodeUnits,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
	closedKeys,
} from "./closed.mjs";
import { UNTITLED_SENTINEL } from "./story_index.mjs";
import { COVERS, KEPT_REASONS } from "./vocab.mjs";

export const TEST_SHIFT_PATH = ".storybook/catalog/test-shift.json";
export const TEST_SHIFT_MD_PATH = ".storybook/catalog/TEST-SHIFT.md";

// The six specs the shift touches, by file stem; sorted by code unit. Nothing else is read.
export const LEDGER_SPECS = Object.freeze([
	"accessibility",
	"app-launch",
	"dark-mode",
	"file-size-display",
	"i18n",
	"metadata-inspection",
]);

// Every problem code this module can raise, sorted by code unit. One mutant per code lives in
// test_shift.test.ts, and a meta-test pins the two lists together.
export const TEST_SHIFT_CODES = Object.freeze([
	"bad-baseline",
	"bad-covers",
	"bad-reason",
	"bad-shape",
	"bad-type",
	"baseline-drift",
	"baseline-missing",
	"baseline-not-ancestor",
	"duplicate-title",
	"dynamic-title",
	"evidence-missing",
	"kept-drift",
	"missing-field",
	"not-deleted",
	"not-object",
	"schema-version",
	"stale",
	"story-missing",
	"subject-mismatch",
	"unknown-field",
	"unledgered",
]);

const MODIFIERS = ["skip", "fixme", "only"];
const HOOKS = ["beforeEach", "afterEach", "beforeAll", "afterAll"];
// A note is capped so the ledger cannot become prose.
const NOTE_LIMIT = 160;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const NAME_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
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
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isExpectHead(node) {
	if (!ts.isCallExpression(node)) return false;
	const callee = node.expression;
	if (ts.isIdentifier(callee)) return callee.text === "expect";
	return (
		ts.isPropertyAccessExpression(callee) &&
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === "expect" &&
		["soft", "poll"].includes(callee.name.text)
	);
}

// Climb from `expect(x)` to the whole matcher chain, so `.not.toBe(y)` is part of the item.
/**
 * @param {ts.Node} node
 * @returns {ts.Node}
 */
function chainTop(node) {
	let top = node;
	while (
		top.parent !== undefined &&
		((ts.isPropertyAccessExpression(top.parent) &&
			top.parent.expression === top) ||
			(ts.isCallExpression(top.parent) && top.parent.expression === top))
	) {
		top = top.parent;
	}
	return top;
}

// A Prettier reflow must not look like drift: collapse whitespace, then drop the whitespace
// after an opener and the comma-plus-whitespace before a closer.
/**
 * @param {string} text
 * @returns {string}
 */
export function squash(text) {
	return text
		.replace(/\s+/g, " ")
		.trim()
		.replace(/([(\[{])\s+/g, "$1")
		.replace(/,?\s+([)\]}])/g, "$1");
}

/**
 * What the compiler API sees in one spec file, walking the whole tree (a title sits inside
 * `test.describe` callbacks). Nothing is executed or imported.
 *
 *   tests        every `test(...)`, `test.skip|fixme|only(...)` with a literal title and a
 *                callback: its title, whether it is modified (skip, fixme, only, directly or
 *                through a describe wrapper of those) and the normalized text of every
 *                expect chain in its callback, in source order
 *   dynamic      the literal head of every test whose title is not a string literal
 *   hookExpects  expect chains inside beforeEach/afterEach/beforeAll/afterAll callbacks,
 *                which sit outside any test
 *
 * @param {object} inputs
 * @param {string} inputs.text
 * @param {string} inputs.file
 * @returns {{ tests: Array<{ title: string, modified: boolean, expects: string[] }>, dynamic: string[], hookExpects: string[] }}
 */
export function e2eAssertions({ text, file }) {
	const source = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	/** @type {Array<{ title: string, modified: boolean, expects: string[] }>} */
	const tests = [];
	/** @type {string[]} */
	const dynamic = [];
	/** @type {string[]} */
	const hookExpects = [];
	/**
	 * @param {ts.Node} body
	 * @returns {string[]}
	 */
	const collect = (body) => {
		/** @type {string[]} */
		const out = [];
		/** @param {ts.Node} node */
		const walk = (node) => {
			if (isExpectHead(node)) {
				out.push(squash(chainTop(node).getText(source)));
			}
			ts.forEachChild(node, walk);
		};
		walk(body);
		return out;
	};
	/**
	 * @param {ts.Node} node
	 * @param {boolean} underModifier
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
			const body = node.arguments.find(
				(argument) =>
					ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
			);
			const chain = ts.isPropertyAccessExpression(callee)
				? memberChain(callee)
				: null;
			const bare = ts.isIdentifier(callee) && callee.text === "test";
			const modified =
				chain !== null &&
				chain[0] === "test" &&
				chain.length === 2 &&
				MODIFIERS.includes(chain[1] ?? "");
			if ((bare || modified) && body !== undefined) {
				if (literal === null) {
					dynamic.push(
						first !== undefined && ts.isTemplateExpression(first)
							? first.head.text
							: "",
					);
				} else {
					tests.push({
						title: literal,
						modified: underModifier || modified,
						expects: collect(body.body),
					});
				}
				return;
			}
			if (chain !== null && chain[0] === "test") {
				const rest = chain.slice(1);
				const hook = rest[0];
				if (
					rest.length === 1 &&
					hook !== undefined &&
					HOOKS.includes(hook) &&
					body !== undefined
				) {
					hookExpects.push(...collect(body.body));
					return;
				}
				if (rest.some((member) => MODIFIERS.includes(member))) inside = true;
			}
		}
		ts.forEachChild(node, (child) => visit(child, inside));
	};
	visit(source, false);
	return { tests, dynamic, hookExpects };
}

// Structure first and values second, returning early so one planted defect gives one code.
/**
 * @param {unknown} doc
 * @returns {Array<{ code: string, message: string }>}
 */
function shapeProblems(doc) {
	if (!isPlainObject(doc)) {
		return [problem("not-object", "the ledger must be a JSON object")];
	}
	const found = closedKeys(
		doc,
		["schemaVersion", "baselineCommit", "specs"],
		[],
		"ledger",
	);
	if (doc["schemaVersion"] !== 1) {
		found.push(problem("schema-version", "schemaVersion must be 1"));
	}
	if (Object.hasOwn(doc, "baselineCommit")) {
		const sha = doc["baselineCommit"];
		if (typeof sha !== "string") {
			found.push(problem("bad-type", "baselineCommit must be a string"));
		} else if (!SHA_PATTERN.test(sha)) {
			found.push(baselineShapeProblem());
		}
	}
	const specs = doc["specs"];
	if (Object.hasOwn(doc, "specs")) {
		if (!isPlainObject(specs)) {
			found.push(problem("bad-type", "specs must be an object"));
		} else {
			found.push(...closedKeys(specs, LEDGER_SPECS, [], "specs"));
			for (const name of LEDGER_SPECS) {
				if (Object.hasOwn(specs, name)) {
					found.push(...specShapeProblems(name, specs[name]));
				}
			}
		}
	}
	return found;
}

function baselineShapeProblem() {
	return problem(
		"bad-baseline",
		"baselineCommit must be a full 40-hex commit sha, so it can never be read as a git option",
	);
}

/**
 * @param {string} where
 * @param {Record<string, unknown>} object
 * @param {string} key
 */
function noteProblems(where, object, key) {
	if (!Object.hasOwn(object, key)) return [];
	const note = object[key];
	if (typeof note !== "string") {
		return [problem("bad-type", `${where} ${key} must be a string`)];
	}
	if (note === "" || note.length > NOTE_LIMIT) {
		return [
			problem(
				"bad-shape",
				`${where} ${key} must be 1 to ${NOTE_LIMIT} code units`,
			),
		];
	}
	return [];
}

/**
 * @param {string} spec
 * @param {unknown} entries
 */
function specShapeProblems(spec, entries) {
	if (!Array.isArray(entries)) {
		return [problem("bad-type", `${spec} must be an array of entries`)];
	}
	const found = [];
	entries.forEach((entry, index) => {
		const where = `${spec}[${index}]`;
		if (!isPlainObject(entry)) {
			found.push(problem("bad-type", `${where} must be an object`));
			return;
		}
		found.push(
			...closedKeys(
				entry,
				["title", "items"],
				["note", "addedAfterBaseline"],
				where,
			),
		);
		if (Object.hasOwn(entry, "title")) {
			if (typeof entry["title"] !== "string") {
				found.push(problem("bad-type", `${where} title must be a string`));
			} else if (entry["title"] === "") {
				found.push(problem("bad-shape", `${where} title must not be empty`));
			}
		}
		found.push(...noteProblems(where, entry, "note"));
		if (
			Object.hasOwn(entry, "addedAfterBaseline") &&
			typeof entry["addedAfterBaseline"] !== "boolean"
		) {
			found.push(
				problem("bad-type", `${where} addedAfterBaseline must be a boolean`),
			);
		}
		const items = entry["items"];
		if (!Object.hasOwn(entry, "items")) return;
		if (!Array.isArray(items)) {
			found.push(problem("bad-type", `${where} items must be an array`));
			return;
		}
		if (items.length === 0) {
			found.push(problem("bad-shape", `${where} has zero items`));
			return;
		}
		const itemProblems = items.flatMap((item, at) =>
			itemShapeProblems(`${where} item ${at + 1}`, item),
		);
		found.push(...itemProblems);
		if (itemProblems.length > 0) return;
		if (items.some((item, at) => item["n"] !== at + 1)) {
			found.push(
				problem(
					"bad-shape",
					`${where} item n values must run 1 to ${items.length}`,
				),
			);
		}
		if (
			entry["addedAfterBaseline"] === true &&
			items.some((item) => item["verdict"] === "deleted")
		) {
			found.push(
				problem(
					"bad-shape",
					`${where} is marked addedAfterBaseline, so it may hold kept items only`,
				),
			);
		}
	});
	return found;
}

/**
 * Required keys differ by verdict. A deleted item needs a story and forbids a reason, a kept
 * item needs a reason from the closed list. Those cases are mapped before the closed key check
 * so one planted defect gives one code.
 *
 * @param {string} where
 * @param {unknown} item
 */
function itemShapeProblems(where, item) {
	if (!isPlainObject(item)) {
		return [problem("bad-type", `${where} must be an object`)];
	}
	const verdict = item["verdict"];
	if (!Object.hasOwn(item, "verdict")) {
		return [problem("missing-field", `${where} is missing verdict`)];
	}
	if (verdict !== "kept" && verdict !== "deleted") {
		return [problem("bad-type", `${where} verdict must be kept or deleted`)];
	}
	if (verdict === "deleted") {
		if (!Object.hasOwn(item, "story") || Object.hasOwn(item, "reason")) {
			return [
				problem(
					"bad-shape",
					`${where} a deleted item needs a story and forbids a reason`,
				),
			];
		}
		const keys = closedKeys(
			item,
			["n", "code", "verdict", "story", "subject", "covers", "evidence"],
			["note"],
			where,
		);
		if (keys.length > 0) return keys;
		const found = [];
		for (const key of ["code", "story", "subject", "evidence"]) {
			found.push(...stringFieldProblems(where, item, key));
		}
		const covers = item["covers"];
		if (typeof covers !== "string") {
			found.push(problem("bad-type", `${where} covers must be a string`));
		} else if (!COVERS.includes(covers)) {
			found.push(
				problem(
					"bad-covers",
					`${where} covers "${covers}" is not in the vocabulary`,
				),
			);
		}
		found.push(...noteProblems(where, item, "note"));
		return found;
	}
	const reason = item["reason"];
	if (typeof reason !== "string" || !KEPT_REASONS.includes(reason)) {
		return [
			problem(
				"bad-reason",
				`${where} a kept item needs a reason from ${KEPT_REASONS.join(", ")}`,
			),
		];
	}
	const keys = closedKeys(
		item,
		["n", "code", "verdict", "reason"],
		["note"],
		where,
	);
	if (keys.length > 0) return keys;
	return [
		...stringFieldProblems(where, item, "code"),
		...noteProblems(where, item, "note"),
	];
}

/**
 * @param {string} where
 * @param {Record<string, unknown>} object
 * @param {string} key
 */
function stringFieldProblems(where, object, key) {
	const value = object[key];
	if (typeof value !== "string") {
		return [problem("bad-type", `${where} ${key} must be a string`)];
	}
	return value === ""
		? [problem("bad-shape", `${where} ${key} must not be empty`)]
		: [];
}

/**
 * Every live test has an entry, a kept item's code multiset equals the live expect multiset,
 * an entry whose test is gone keeps nothing, an all-deleted entry whose test remains is red,
 * and every deleted item names a story that exists, whose component is the item's subject
 * and whose export scope holds the item's evidence literal.
 *
 * @param {object} inputs
 * @param {unknown} inputs.doc the parsed ledger, unvalidated
 * @param {Readonly<Record<string, string>>} inputs.specTexts spec stem to file text
 * @param {ReadonlyArray<{ id: string, component: string | null }>} [inputs.stories]
 * @param {ReadonlyMap<string, { scope: string }>} [inputs.scopes] story id to its evidence scope
 * @returns {Array<{ code: string, message: string, id?: string | undefined }>}
 */
export function checkTestShift({
	doc,
	specTexts,
	stories = [],
	scopes = new Map(),
}) {
	const structural = shapeProblems(doc);
	if (structural.length > 0) return sortProblems(structural);
	const specs = /** @type {Record<string, any[]>} */ (
		/** @type {any} */ (doc).specs
	);
	const found = [];
	for (const spec of LEDGER_SPECS) {
		found.push(...checkSpec(spec, specs[spec] ?? [], specTexts[spec] ?? ""));
		found.push(...storyProblems(spec, specs[spec] ?? [], stories, scopes));
	}
	return sortProblems(found);
}

/**
 * @param {string} spec
 * @param {any[]} entries
 * @param {ReadonlyArray<{ id: string, component: string | null }>} stories
 * @param {ReadonlyMap<string, { scope: string }>} scopes
 */
function storyProblems(spec, entries, stories, scopes) {
	const byId = new Map(stories.map((story) => [story.id, story]));
	const found = [];
	for (const entry of entries) {
		for (const item of entry.items) {
			if (item.verdict !== "deleted") continue;
			const id = `${spec}/${entry.title}`;
			const where = `${spec}: "${entry.title}" item ${item.n}`;
			const record = byId.get(item.story);
			if (record === undefined) {
				found.push(
					problem(
						"story-missing",
						`${where} names the story ${item.story}, which does not exist`,
						{ id },
					),
				);
				continue;
			}
			if (record.component !== item.subject) {
				found.push(
					problem(
						"subject-mismatch",
						`${where} has subject ${item.subject} but ${item.story} is a story of ${record.component}`,
						{ id },
					),
				);
				continue;
			}
			const scope = scopes.get(item.story)?.scope ?? "";
			if (!scope.includes(item.evidence)) {
				found.push(
					problem(
						"evidence-missing",
						`${where}: the evidence "${item.evidence}" is not in the source of ${item.story}`,
						{ id },
					),
				);
			} else if (
				item.covers === "focus-order" &&
				!scope.includes("toHaveFocus")
			) {
				found.push(
					problem(
						"evidence-missing",
						`${where}: a focus-order item needs toHaveFocus in the source of ${item.story}`,
						{ id },
					),
				);
			}
		}
	}
	return found;
}

/**
 * @param {string} spec
 * @param {any[]} entries
 * @param {string} text
 */
function checkSpec(spec, entries, text) {
	const found = [];
	const walk = e2eAssertions({ text, file: `${spec}.spec.ts` });
	for (const head of walk.dynamic) {
		found.push(
			problem(
				"dynamic-title",
				`${spec}: a test title is not a string literal (it starts "${head}")`,
				{ id: `${spec}/(dynamic)` },
			),
		);
	}
	/** @type {Map<string, { expects: string[] }>} */
	const live = new Map();
	for (const test of walk.tests) {
		if (test.modified) continue;
		if (live.has(test.title)) {
			found.push(
				problem(
					"duplicate-title",
					`${spec}: the test title "${test.title}" appears more than once in the spec`,
					{ id: `${spec}/${test.title}` },
				),
			);
			continue;
		}
		live.set(test.title, test);
	}
	/** @type {Map<string, any>} */
	const byTitle = new Map();
	for (const entry of entries) {
		if (byTitle.has(entry.title)) {
			found.push(
				problem(
					"duplicate-title",
					`${spec}: the ledger has more than one entry for "${entry.title}"`,
					{ id: `${spec}/${entry.title}` },
				),
			);
			continue;
		}
		byTitle.set(entry.title, entry);
	}
	for (const [title, test] of live) {
		const id = `${spec}/${title}`;
		const entry = byTitle.get(title);
		if (entry === undefined) {
			found.push(
				problem(
					"unledgered",
					`${spec}: the test "${title}" has no ledger entry`,
					{ id },
				),
			);
			continue;
		}
		const items = /** @type {any[]} */ (entry.items);
		if (items.length > 0 && items.every((item) => item.verdict === "deleted")) {
			found.push(
				problem(
					"not-deleted",
					`${spec}: every item of "${title}" is deleted but the test still exists`,
					{ id },
				),
			);
			continue;
		}
		const kept = items
			.filter((item) => item.verdict === "kept")
			.map((item) => String(item.code))
			.sort(compareCodeUnits);
		const expects = [...test.expects].sort(compareCodeUnits);
		if (
			kept.length !== expects.length ||
			kept.some((code, index) => code !== expects[index])
		) {
			found.push(
				problem(
					"kept-drift",
					`${spec}: the kept items of "${title}" (${kept.length}) differ from the live expect calls (${expects.length})`,
					{ id },
				),
			);
		}
	}
	for (const [title, entry] of byTitle) {
		if (live.has(title)) continue;
		if (/** @type {any[]} */ (entry.items).some((i) => i.verdict === "kept")) {
			found.push(
				problem(
					"stale",
					`${spec}: the ledger keeps assertions of "${title}" but no live test has that title (renamed, removed, skipped, fixme or only)`,
					{ id: `${spec}/${title}` },
				),
			);
		}
	}
	return found;
}

/**
 * The ledger and the six spec texts, read through the root-confined resolver. Only the six
 * literal spec names are read. A spec that cannot be read fails closed.
 *
 * @param {string} root
 * @returns {{ doc: unknown, specTexts: Record<string, string> }}
 */
export function loadTestShiftInputs(root) {
	const doc = readJson(root, TEST_SHIFT_PATH);
	/** @type {Record<string, string>} */
	const specTexts = {};
	for (const name of LEDGER_SPECS) {
		const relPath = `tests/e2e/${name}.spec.ts`;
		const resolved = resolveInRoot(root, relPath);
		if (resolved === null) {
			throw new Error(`${relPath} is outside the repository`);
		}
		try {
			specTexts[name] = fs.readFileSync(resolved, "utf8");
		} catch (error) {
			throw new Error(
				`${relPath} could not be read: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return { doc, specTexts };
}

/**
 * @param {string} text
 */
function cell(text) {
	return text.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
}

/**
 * TEST-SHIFT.md is a pure function of the validated ledger: spec sections in LEDGER_SPECS
 * order, entries and items in ledger order, no timestamps.
 *
 * @param {any} doc
 * @returns {string}
 */
export function renderTestShift(doc) {
	const lines = [
		"<!-- Generated from test-shift.json by .storybook/catalog/catalog.mjs. Do not edit: edit test-shift.json and run yarn catalog:write. -->",
		"",
		"# Test shift ledger",
		"",
		`Baseline commit: ${doc.baselineCommit}`,
		"",
		"One row per `expect(`, `expect.soft(` or `expect.poll(` call inside a test callback of the six specs below, grouped by test title. A `kept` row stays in the e2e spec for the reason shown. A `deleted` row moved to the named story, whose export source holds the evidence.",
	];
	for (const spec of LEDGER_SPECS) {
		lines.push("", `## ${spec}`);
		for (const entry of doc.specs[spec]) {
			lines.push(
				"",
				`### ${cell(entry.title)}${entry.addedAfterBaseline === true ? " (added after baseline)" : ""}`,
			);
			if (Object.hasOwn(entry, "note")) lines.push("", cell(entry.note));
			lines.push(
				"",
				"| n | verdict | code | story or reason | covers | evidence | note |",
				"| --- | --- | --- | --- | --- | --- | --- |",
			);
			for (const item of entry.items) {
				const where = item.verdict === "deleted" ? item.story : item.reason;
				lines.push(
					`| ${item.n} | ${item.verdict} | ${cell(String(item.code))} | ${cell(String(where ?? ""))} | ${cell(String(item.covers ?? ""))} | ${cell(String(item.evidence ?? ""))} | ${cell(String(item.note ?? ""))} |`,
				);
			}
		}
	}
	lines.push(
		"",
		"## Known limits",
		"",
		"- The count is lexical: one item per `expect(`, `expect.soft(` or `expect.poll(` call in a test callback. A loop body counts once however many times it runs.",
		"- Assertions inside helper functions are invisible to the count. The six specs call two such helpers, `assertDirEffect` (throws on an unexpected directory change) and `waitForProcessing` (throws on a timeout).",
		"- Two `afterEach` console-error guards, one in app-launch and one in metadata-inspection, sit outside any test. They stay and guard every kept test.",
		'- A story\'s simulated Tab is not a trusted browser Tab. The accessibility test "traps focus within settings drawer when open" stays as the real-Chromium backstop for focus handling.',
		"- A `deleted` item's evidence literal is matched by presence in the story's export source plus the same-file helpers it calls. That does not prove the literal belongs to the statement making the claim.",
		"- The dark-mode test \"renders all components correctly in dark mode\" scans the whole document for zero-opacity elements. The story side covers only the `screens-app--empty` level-1 heading's `toBeVisible`, which checks that element and its ancestor chain, plus the play's `data-theme` assertion. This is a named reduction, not equivalence.",
	);
	return `${lines.join("\n")}\n`;
}

// Slice by line and column: Babel's character offsets are not text offsets for a
// tab-indented file (measured on all 189 stories at the time of writing).
/**
 * @param {string} code
 * @param {string[]} lines
 * @param {{ start: { line: number, column: number }, end: { line: number, column: number } }} loc
 */
function sliceOf(code, lines, loc) {
	/** @param {number} line @param {number} column */
	const at = (line, column) =>
		lines
			.slice(0, line - 1)
			.reduce((total, text) => total + text.length + 1, 0) + column;
	return code.slice(
		at(loc.start.line, loc.start.column),
		at(loc.end.line, loc.end.column),
	);
}

/**
 * The evidence scope of every story in one file: the story export's own source plus the
 * same-file helper functions that export calls (one level; a helper's helpers are not
 * followed). File-level constants are not functions, so evidence that lives only in a shared
 * constant is cited by its identifier. Nothing is executed.
 *
 * @param {string} absPath
 * @returns {Promise<Map<string, { exportName: string, own: string, scope: string }>>}
 */
export async function storySources(absPath) {
	const code = fs.readFileSync(absPath, "utf8");
	const lines = code.split("\n");
	const csf = await readCsf(absPath, {
		makeTitle: (/** @type {string | null | undefined} */ title) =>
			title ?? UNTITLED_SENTINEL,
	});
	csf.parse();
	/** @type {Map<string, string>} */
	const helpers = new Map();
	for (const statement of /** @type {any} */ (csf)._ast.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type === "FunctionDeclaration" && declaration.id) {
			helpers.set(declaration.id.name, sliceOf(code, lines, declaration.loc));
		} else if (declaration?.type === "VariableDeclaration") {
			for (const declarator of declaration.declarations) {
				const isFunction =
					declarator.init?.type === "ArrowFunctionExpression" ||
					declarator.init?.type === "FunctionExpression";
				if (declarator.id?.type === "Identifier" && isFunction) {
					helpers.set(
						declarator.id.name,
						sliceOf(code, lines, declaration.loc),
					);
				}
			}
		}
	}
	/** @type {Map<string, { exportName: string, own: string, scope: string }>} */
	const out = new Map();
	for (const input of csf.indexInputs) {
		const node = csf.getStoryExport(input.exportName);
		const own = sliceOf(code, lines, /** @type {any} */ (node).loc);
		const called = [...helpers]
			.filter(([name]) => NAME_PATTERN.test(name) && calls(own, name))
			.map(([, source]) => source);
		out.set(input.__id, {
			exportName: input.exportName,
			own,
			scope: [own, ...called].join("\n"),
		});
	}
	return out;
}

// Does `source` call `name(`? The name is an AST identifier checked against NAME_PATTERN,
// with `$` escaped, never ledger data, and the pattern is linear.
/**
 * @param {string} source
 * @param {string} name
 */
function calls(source, name) {
	return new RegExp(`(?<![\\w$])${name.replaceAll("$", "\\$")}\\s*\\(`).test(
		source,
	);
}

/**
 * @param {unknown} doc
 * @returns {string[]}
 */
function deletedStoryIds(doc) {
	/** @type {string[]} */
	const ids = [];
	if (!isPlainObject(doc) || !isPlainObject(doc["specs"])) return ids;
	for (const entries of Object.values(doc["specs"])) {
		if (!Array.isArray(entries)) continue;
		for (const entry of entries) {
			if (!isPlainObject(entry) || !Array.isArray(entry["items"])) continue;
			for (const item of entry["items"]) {
				if (
					isPlainObject(item) &&
					item["verdict"] === "deleted" &&
					typeof item["story"] === "string"
				) {
					ids.push(item["story"]);
				}
			}
		}
	}
	return ids;
}

/**
 * The evidence scope of each story a deleted item names, reading each story file once and
 * no file when the ledger names no story.
 *
 * @param {string} root
 * @param {ReadonlyArray<{ id: string, file: string }>} stories
 * @param {unknown} doc
 * @returns {Promise<Map<string, { exportName: string, own: string, scope: string }>>}
 */
export async function loadStoryScopes(root, stories, doc) {
	const wanted = new Set(deletedStoryIds(doc));
	const files = new Set();
	for (const story of stories) {
		if (wanted.has(story.id)) files.add(story.file);
	}
	const scopes = new Map();
	for (const file of [...files].sort(compareCodeUnits)) {
		const resolved = resolveInRoot(root, file);
		if (resolved === null) continue;
		for (const [id, source] of await storySources(resolved)) {
			scopes.set(id, source);
		}
	}
	return scopes;
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function gitText(args, cwd) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/**
 * The ledger against git. `baselineCommit` must be a full sha, a commit in this clone and an
 * ancestor of HEAD (the Storybook job checks out with fetch-depth: 0), and the (title, code)
 * multiset the ledger holds for each spec, less entries marked addedAfterBaseline, must equal
 * the one `git show <baselineCommit>:tests/e2e/<spec>.spec.ts` yields through e2eAssertions.
 * The sha is validated before any git call and only the six literal spec names are read.
 * The CLI does not call this: a temp repo has no baseline. The real-repo test does.
 *
 * @param {string} root
 * @param {unknown} doc
 * @param {{ git?: (args: string[], cwd: string) => string }} [options]
 * @returns {Array<{ code: string, message: string }>}
 */
export function checkTestShiftBaseline(root, doc, options = {}) {
	const git = options.git ?? gitText;
	const sha = isPlainObject(doc) ? doc["baselineCommit"] : undefined;
	if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) {
		return [baselineShapeProblem()];
	}
	try {
		git(["cat-file", "-e", `${sha}^{commit}`], root);
	} catch {
		return [
			problem(
				"baseline-missing",
				`baselineCommit ${sha.slice(0, 7)} is not in this clone; the Storybook job checks out with fetch-depth: 0`,
			),
		];
	}
	try {
		git(["merge-base", "--is-ancestor", sha, "HEAD"], root);
	} catch {
		return [
			problem(
				"baseline-not-ancestor",
				`baselineCommit ${sha.slice(0, 7)} is not an ancestor of HEAD`,
			),
		];
	}
	const specs = /** @type {Record<string, any[]>} */ (
		/** @type {any} */ (doc).specs
	);
	const found = [];
	for (const spec of LEDGER_SPECS) {
		const walk = e2eAssertions({
			text: git(["show", `${sha}:tests/e2e/${spec}.spec.ts`], root),
			file: `${spec}.spec.ts`,
		});
		const baseline = walk.tests
			.filter((test) => !test.modified)
			.flatMap((test) => test.expects.map((code) => `${test.title}\0${code}`))
			.sort(compareCodeUnits);
		const ledger = (Array.isArray(specs?.[spec]) ? specs[spec] : [])
			.filter((entry) => entry.addedAfterBaseline !== true)
			.flatMap((entry) =>
				entry.items.map((item) => `${entry.title}\0${item.code}`),
			)
			.sort(compareCodeUnits);
		if (
			baseline.length !== ledger.length ||
			baseline.some((line, index) => line !== ledger[index])
		) {
			found.push(
				problem(
					"baseline-drift",
					`${spec}: the ledger (${ledger.length} items) differs from the baseline commit (${baseline.length} expect calls)`,
					{ id: spec },
				),
			);
		}
	}
	return sortProblems(found);
}
