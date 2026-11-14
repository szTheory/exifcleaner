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
import fs from "node:fs";
import ts from "typescript";
import {
	compareCodeUnits,
	isPlainObject,
	problem,
	readJson,
	resolveInRoot,
	sortProblems,
	closedKeys,
} from "./closed.mjs";

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
	"bad-type",
	"duplicate-title",
	"dynamic-title",
	"kept-drift",
	"missing-field",
	"not-deleted",
	"not-object",
	"schema-version",
	"stale",
	"unknown-field",
	"unledgered",
]);

const MODIFIERS = ["skip", "fixme", "only"];
const HOOKS = ["beforeEach", "afterEach", "beforeAll", "afterAll"];

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

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonEmptyString(value) {
	return typeof value === "string" && value !== "";
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
	if (
		Object.hasOwn(doc, "baselineCommit") &&
		typeof doc["baselineCommit"] !== "string"
	) {
		found.push(problem("bad-type", "baselineCommit must be a string"));
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
		if (Object.hasOwn(entry, "title") && typeof entry["title"] !== "string") {
			found.push(problem("bad-type", `${where} title must be a string`));
		}
		const items = entry["items"];
		if (Object.hasOwn(entry, "items")) {
			if (!Array.isArray(items)) {
				found.push(problem("bad-type", `${where} items must be an array`));
			} else {
				items.forEach((item, at) => {
					found.push(...itemShapeProblems(`${where} item ${at + 1}`, item));
				});
			}
		}
	});
	return found;
}

/**
 * @param {string} where
 * @param {unknown} item
 */
function itemShapeProblems(where, item) {
	if (!isPlainObject(item)) {
		return [problem("bad-type", `${where} must be an object`)];
	}
	const found = closedKeys(
		item,
		["n", "code", "verdict"],
		["reason", "note", "story", "subject", "covers", "evidence"],
		where,
	);
	if (
		Object.hasOwn(item, "verdict") &&
		item["verdict"] !== "kept" &&
		item["verdict"] !== "deleted"
	) {
		found.push(problem("bad-type", `${where} verdict must be kept or deleted`));
	}
	if (Object.hasOwn(item, "code") && typeof item["code"] !== "string") {
		found.push(problem("bad-type", `${where} code must be a string`));
	}
	return found;
}

/**
 * Every live test has an entry, a kept item's code multiset equals the live expect multiset,
 * an entry whose test is gone keeps nothing, an all-deleted entry whose test remains is red.
 *
 * @param {object} inputs
 * @param {unknown} inputs.doc the parsed ledger, unvalidated
 * @param {Readonly<Record<string, string>>} inputs.specTexts spec stem to file text
 * @returns {Array<{ code: string, message: string, id?: string | undefined }>}
 */
export function checkTestShift({ doc, specTexts }) {
	const structural = shapeProblems(doc);
	if (structural.length > 0) return sortProblems(structural);
	const specs = /** @type {Record<string, any[]>} */ (
		/** @type {any} */ (doc).specs
	);
	const found = [];
	for (const spec of LEDGER_SPECS) {
		found.push(...checkSpec(spec, specs[spec] ?? [], specTexts[spec] ?? ""));
	}
	return sortProblems(found);
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
