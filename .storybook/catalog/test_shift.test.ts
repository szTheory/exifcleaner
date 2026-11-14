// The test-shift ledger (Phase 75, TST-01): walker parity, one in-process mutant per rule
// code, the generated view, the real-repo baseline test and the real CLI against temp git
// repositories. Planted spec text that needs a runner control is assembled from fragments, so
// no_skip.test.ts (which scans this file's raw text) stays green.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { sortProblems } from "./closed.mjs";
import { e2eTitles } from "./journeys.mjs";
import { enumerateStories, listStoryFiles } from "./story_index.mjs";
import {
	LEDGER_SPECS,
	TEST_SHIFT_CODES,
	TEST_SHIFT_MD_PATH,
	TEST_SHIFT_PATH,
	checkTestShift,
	checkTestShiftBaseline,
	e2eAssertions,
	loadStoryScopes,
	loadTestShiftInputs,
	renderTestShift,
	squash,
	storySources,
	type StoryScope,
} from "./test_shift.mjs";
import {
	GIT_ENV,
	makeCatalogRepo,
	realScript,
	repoRoot,
	runNode,
} from "./temp_repo";

const CATALOG = ".storybook/catalog/catalog.mjs";
const RUN = ["te", "st"].join("");
const SKIP = ["sk", "ip"].join("");

interface Item {
	n: number;
	code: string;
	verdict: string;
	reason?: string;
	story?: string;
	subject?: string;
	covers?: string;
	evidence?: string;
	note?: string;
	[key: string]: unknown;
}
interface Entry {
	title: string;
	items: Item[];
	note?: string;
	addedAfterBaseline?: boolean;
	[key: string]: unknown;
}
interface Ledger {
	schemaVersion: number;
	baselineCommit: string;
	specs: Record<string, Entry[]>;
	[key: string]: unknown;
}

const real = JSON.parse(
	fs.readFileSync(path.join(repoRoot, TEST_SHIFT_PATH), "utf8"),
) as Ledger;
const inputs = loadTestShiftInputs(repoRoot);
const stories = await enumerateStories(repoRoot);
const allScopes = new Map<string, StoryScope>();
for (const file of listStoryFiles(repoRoot)) {
	for (const [id, source] of await storySources(path.join(repoRoot, file))) {
		allScopes.set(id, source);
	}
}

function at<T>(items: readonly T[], index: number): T {
	const found = items[index];
	if (found === undefined) throw new Error(`no item at ${index}`);
	return found;
}

function specOf(doc: Ledger, spec: string): Entry[] {
	const found = doc.specs[spec];
	if (found === undefined) throw new Error(`no spec ${spec}`);
	return found;
}

function entryOf(doc: Ledger, spec: string, title: string): Entry {
	const found = specOf(doc, spec).find((entry) => entry.title === title);
	if (found === undefined) throw new Error(`no entry ${spec}/${title}`);
	return found;
}

function text(spec: string): string {
	const found = inputs.specTexts[spec];
	if (found === undefined) throw new Error(`no spec text ${spec}`);
	return found;
}

function withText(spec: string, edited: string): Record<string, string> {
	expect(edited, `the ${spec} text must differ from the original`).not.toBe(
		text(spec),
	);
	return { ...inputs.specTexts, [spec]: edited };
}

function clone(): Ledger {
	return structuredClone(real);
}

function check(
	doc: unknown,
	specTexts: Readonly<Record<string, string>> = inputs.specTexts,
	scopes: ReadonlyMap<string, StoryScope> = allScopes,
): string[] {
	return checkTestShift({ doc, specTexts, stories, scopes }).map(
		(found) => found.code,
	);
}

// A fixture, not a claim: file-size-display never moves to a story. It is a test that
// survives the shift untouched, so the deleted-item rules have a valid shape to mutate.
const SIZE_SPEC = "file-size-display";
const SIZE_TITLE = "shows 0 B only when the file is genuinely empty";
const SIZE_STATEMENT = 'await expect(sizeCell).toHaveText("0 B");';
const DELETED_FIELDS = {
	verdict: "deleted",
	story: "screens-app--empty",
	subject: "App",
	covers: "text",
	evidence: "Add files to clean",
};

function removeStatement(
	specText: string,
	title: string,
	statement: string,
): string {
	const from = specText.indexOf(`${RUN}("${title}"`);
	const found = specText.indexOf(statement, from);
	if (from < 0 || found < 0) throw new Error(`${statement} not in ${title}`);
	const start = specText.lastIndexOf("\n", found) + 1;
	const end = specText.indexOf("\n", found) + 1;
	return specText.slice(0, start) + specText.slice(end);
}

function turnIntoDeleted(item: Item, over: Record<string, unknown>): void {
	delete item.reason;
	delete item.note;
	Object.assign(item, DELETED_FIELDS, over);
}

function deletedFixture(over: Record<string, unknown> = {}) {
	const doc = clone();
	turnIntoDeleted(at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 1), over);
	return {
		doc,
		specTexts: {
			...inputs.specTexts,
			[SIZE_SPEC]: removeStatement(text(SIZE_SPEC), SIZE_TITLE, SIZE_STATEMENT),
		},
	};
}

function codesOf(fixture: { doc: Ledger; specTexts: Record<string, string> }) {
	return check(fixture.doc, fixture.specTexts);
}

const NO_GIT = (): string => {
	throw new Error("git must not be reached");
};
const ABSENT_GIT = (args: string[]): string => {
	if (args[0] === "cat-file") throw new Error("not a commit");
	throw new Error(`unexpected git ${args.join(" ")}`);
};
const ORPHAN_GIT = (args: string[]): string => {
	if (args[0] === "cat-file") return "";
	if (args[0] === "merge-base") throw new Error("not an ancestor");
	throw new Error(`unexpected git ${args.join(" ")}`);
};

function baselineCodes(
	doc: unknown,
	options: { git?: (args: string[], cwd: string) => string } = {},
): string[] {
	return checkTestShiftBaseline(repoRoot, doc, options).map(
		(found) => found.code,
	);
}

function jsonText(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

describe("walker parity", () => {
	test("e2eAssertions titles equal e2eTitles for every tests/e2e spec", () => {
		const dir = path.join(repoRoot, "tests/e2e");
		const specs = fs
			.readdirSync(dir)
			.filter((name) => name.endsWith(".spec.ts"));
		expect(specs.length).toBeGreaterThan(10);
		for (const name of specs) {
			const specText = fs.readFileSync(path.join(dir, name), "utf8");
			const walk = e2eAssertions({ text: specText, file: name });
			const titles = e2eTitles({ text: specText, file: name });
			expect(
				walk.tests.filter((t) => !t.modified).map((t) => t.title),
				name,
			).toEqual(titles.titles);
			expect(
				walk.tests.filter((t) => t.modified).map((t) => t.title),
				name,
			).toEqual(titles.modified);
			expect(walk.dynamic, name).toEqual(titles.dynamic);
		}
	});

	test("the six ledger specs have static titles and no modified test", () => {
		for (const spec of LEDGER_SPECS) {
			const walk = e2eAssertions({ text: text(spec), file: `${spec}.spec.ts` });
			expect(walk.dynamic, spec).toEqual([]);
			expect(
				walk.tests.filter((t) => t.modified),
				spec,
			).toEqual([]);
			expect(walk.tests.length, spec).toBeGreaterThan(0);
		}
	});

	test("squash maps a wrapped expect and its one-line form to the same text", () => {
		const oneLine = `${RUN}("t", async () => {\n\tawait expect(emptyState.locator(".x")).toHaveText("Choose files…");\n});`;
		const wrapped = `${RUN}("t", async () => {\n\tawait expect(\n\t\temptyState.locator(".x"),\n\t).toHaveText("Choose files…");\n});`;
		const a = e2eAssertions({ text: oneLine, file: "a.spec.ts" });
		const b = e2eAssertions({ text: wrapped, file: "a.spec.ts" });
		expect(a.tests).toHaveLength(1);
		expect(b.tests).toEqual(a.tests);
		expect(squash("expect(\n\tx,\n).toBe(1)")).toBe("expect(x).toBe(1)");
	});

	test("expect.soft, expect.poll and a not chain are one item each, hooks are separate", () => {
		const source = [
			`${RUN}("t", async () => {`,
			"\tawait expect.soft(a).toBe(1);",
			"\tawait expect.poll(() => b).not.toBe(2);",
			"\tawait expect(c).toBe(3);",
			"});",
			`${RUN}.afterEach(async () => {`,
			"\texpect(d).toEqual([]);",
			"});",
		].join("\n");
		const walk = e2eAssertions({ text: source, file: "a.spec.ts" });
		expect(walk.tests).toEqual([
			{
				title: "t",
				modified: false,
				expects: [
					"expect.soft(a).toBe(1)",
					"expect.poll(() => b).not.toBe(2)",
					"expect(c).toBe(3)",
				],
			},
		]);
		expect(walk.hookExpects).toEqual(["expect(d).toEqual([])"]);
	});
});

describe("storySources", () => {
	test("slices an export and the same-file helpers it calls, not the rest of the file", () => {
		const empty = allScopes.get("screens-app--empty");
		expect(empty?.own).toContain("Add files to clean");
		expect(empty?.own).toContain("toHaveFocus");
		const copy = allScopes.get("ui-emptystate--copy-mode-on");
		expect(copy?.own).not.toContain("Add files to clean");
		expect(copy?.scope).toContain("Add files to clean");
		expect(copy?.scope).toContain("getBoundingClientRect");
		const persian = allScopes.get("ui-emptystate--persian-empty");
		expect(persian?.own).toContain("getBoundingClientRect");
		expect(persian?.own).not.toContain("toHaveFocus");
	});

	test("loadStoryScopes reads only the files of deleted items", async () => {
		// A ledger that names no story reads no file. The real ledger holds deleted items
		// since 75-02, so the empty case is a ledger with no specs.
		expect(
			(await loadStoryScopes(repoRoot, stories, { ...real, specs: {} })).size,
		).toBe(0);
		const cited = new Set(
			Object.values(real.specs)
				.flat()
				.flatMap((entry) => entry.items)
				.flatMap((item) =>
					item.verdict === "deleted" && item.story !== undefined
						? [item.story]
						: [],
				),
		);
		const files = new Set(
			stories.filter((story) => cited.has(story.id)).map((story) => story.file),
		);
		const realScopes = await loadStoryScopes(repoRoot, stories, real);
		for (const id of cited) {
			expect(realScopes.has(id), `${id} is read`).toBe(true);
		}
		for (const id of realScopes.keys()) {
			const file = stories.find((story) => story.id === id)?.file ?? "";
			expect(files.has(file), `${id} comes from a cited file`).toBe(true);
		}
		const fixture = deletedFixture();
		const scopes = await loadStoryScopes(repoRoot, stories, fixture.doc);
		expect(scopes.get("screens-app--empty")?.scope).toContain("toHaveFocus");
		expect(check(fixture.doc, fixture.specTexts, scopes)).toEqual([]);
	});
});

describe("the real ledger", () => {
	test("the real ledger is clean and the fixtures start clean", () => {
		expect(check(real)).toEqual([]);
		expect(codesOf(deletedFixture())).toEqual([]);
	});

	test("the ledger holds 78 items over 26 tests, the baseline counts", () => {
		const entries = Object.values(real.specs).flat();
		expect(entries).toHaveLength(26);
		expect(entries.reduce((sum, entry) => sum + entry.items.length, 0)).toBe(
			78,
		);
	});

	test("renderTestShift twice byte-identical, no CR, one trailing newline, spec order", () => {
		const first = renderTestShift(real);
		const second = renderTestShift(structuredClone(real));
		expect(second).toBe(first);
		expect(first).not.toContain("\r");
		expect(first.endsWith("\n")).toBe(true);
		expect(first.endsWith("\n\n")).toBe(false);
		const headings = [...first.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
		expect(headings).toEqual([...LEDGER_SPECS, "Known limits"]);
		expect(first.split("\n")[0]).toBe(
			"<!-- Generated from test-shift.json by .storybook/catalog/catalog.mjs. Do not edit: edit test-shift.json and run yarn catalog:write. -->",
		);
	});

	test("the committed TEST-SHIFT.md equals the regenerated text", () => {
		expect(
			fs.readFileSync(path.join(repoRoot, TEST_SHIFT_MD_PATH), "utf8"),
		).toBe(renderTestShift(real));
	});

	test("sortProblems order: emission order is the reverse of the sorted order", () => {
		const doc = clone();
		const accessibility = specOf(doc, "accessibility");
		// The drawer test is the one accessibility test that stays live after 75-02, so
		// removing its entry leaves a live test with no ledger entry.
		accessibility.splice(
			accessibility.findIndex(
				(entry) =>
					entry.title === "traps focus within settings drawer when open",
			),
			1,
		);
		// A kept item of a test that stays live: an edited code is drift, while the code of a
		// deleted item is not compared with the spec.
		const item = at(
			entryOf(
				doc,
				"metadata-inspection",
				"shows metadata groups with before/after diff",
			).items,
			0,
		);
		item.code = `${item.code} `;
		const result = checkTestShift({
			doc,
			specTexts: inputs.specTexts,
			stories,
			scopes: allScopes,
		});
		expect(result.map((found) => found.code)).toEqual([
			"kept-drift",
			"unledgered",
		]);
		expect(result).toEqual(sortProblems(result));
	});
});

describe("adjacency, empty and shape rules", () => {
	test("two identical expect texts in one test are compared as a multiset", () => {
		const ledger = clone();
		const items = entryOf(ledger, SIZE_SPEC, SIZE_TITLE).items;
		const second = at(items, 1);
		items.push({ ...second, n: 3 });
		const doubled = text(SIZE_SPEC).replace(
			SIZE_STATEMENT,
			`${SIZE_STATEMENT}\n\t\t\t${SIZE_STATEMENT}`,
		);
		// Both copies kept and both present: clean.
		expect(check(ledger, withText(SIZE_SPEC, doubled))).toEqual([]);
		// A copy added to the spec only, then a copy removed from the spec only: both red.
		expect(check(real, withText(SIZE_SPEC, doubled))).toEqual(["kept-drift"]);
		expect(check(ledger)).toEqual(["kept-drift"]);
	});

	test("an empty entry array for a spec with live tests is unledgered per test", () => {
		const doc = clone();
		doc.specs["i18n"] = [];
		const walk = e2eAssertions({ text: text("i18n"), file: "i18n.spec.ts" });
		expect(check(doc)).toEqual(walk.tests.map(() => "unledgered"));
	});

	test("a missing spec key is missing-field and an extra spec key is unknown-field", () => {
		const missing = clone();
		delete missing.specs["i18n"];
		expect(check(missing)).toEqual(["missing-field"]);
		const extra = clone();
		extra.specs["settings"] = [];
		expect(check(extra)).toEqual(["unknown-field"]);
	});

	test("bad-shape variants each give exactly bad-shape", () => {
		const noStory = deletedFixture();
		delete at(entryOf(noStory.doc, SIZE_SPEC, SIZE_TITLE).items, 1).story;
		expect(codesOf(noStory)).toEqual(["bad-shape"]);

		const both = deletedFixture({ reason: "real-electron" });
		expect(codesOf(both)).toEqual(["bad-shape"]);

		const zero = clone();
		entryOf(zero, SIZE_SPEC, SIZE_TITLE).items = [];
		expect(check(zero)).toEqual(["bad-shape"]);

		for (const key of ["story", "evidence", "subject"]) {
			const empty = deletedFixture({ [key]: "" });
			expect(codesOf(empty), key).toEqual(["bad-shape"]);
		}
		const emptyNote = clone();
		at(entryOf(emptyNote, SIZE_SPEC, SIZE_TITLE).items, 0).note = "";
		expect(check(emptyNote)).toEqual(["bad-shape"]);
		const emptyTitle = clone();
		entryOf(emptyTitle, SIZE_SPEC, SIZE_TITLE).title = "";
		expect(check(emptyTitle)).toEqual(["bad-shape"]);

		const longNote = clone();
		at(entryOf(longNote, SIZE_SPEC, SIZE_TITLE).items, 0).note = "x".repeat(
			161,
		);
		expect(check(longNote)).toEqual(["bad-shape"]);
		const edgeNote = clone();
		at(entryOf(edgeNote, SIZE_SPEC, SIZE_TITLE).items, 0).note = "x".repeat(
			160,
		);
		expect(check(edgeNote)).toEqual([]);

		const badOrder = clone();
		at(entryOf(badOrder, SIZE_SPEC, SIZE_TITLE).items, 1).n = 5;
		expect(check(badOrder)).toEqual(["bad-shape"]);

		const lateDeleted = deletedFixture();
		entryOf(lateDeleted.doc, SIZE_SPEC, SIZE_TITLE).addedAfterBaseline = true;
		expect(codesOf(lateDeleted)).toEqual(["bad-shape"]);
	});

	test("unknown keys are unknown-field, including __proto__", () => {
		const extra = clone();
		at(entryOf(extra, SIZE_SPEC, SIZE_TITLE).items, 0)["extra"] = 1;
		expect(check(extra)).toEqual(["unknown-field"]);
		const proto = JSON.parse(
			jsonText(real).replace(
				'"schemaVersion": 1,',
				'"schemaVersion": 1,\n\t"__proto__": { "polluted": true },',
			),
		) as unknown;
		expect(check(proto)).toEqual(["unknown-field"]);
		expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
		const keptStory = clone();
		at(entryOf(keptStory, SIZE_SPEC, SIZE_TITLE).items, 0).story =
			"screens-app--empty";
		expect(check(keptStory)).toEqual(["unknown-field"]);
	});

	test("an out-of-vocabulary reason or covers is bad-reason or bad-covers", () => {
		const reason = clone();
		at(entryOf(reason, SIZE_SPEC, SIZE_TITLE).items, 0).reason = "because";
		expect(check(reason)).toEqual(["bad-reason"]);
		const none = clone();
		delete at(entryOf(none, SIZE_SPEC, SIZE_TITLE).items, 0).reason;
		expect(check(none)).toEqual(["bad-reason"]);
		expect(codesOf(deletedFixture({ covers: "color" }))).toEqual([
			"bad-covers",
		]);
		expect(codesOf(deletedFixture({ covers: "focus-indicator" }))).toEqual([]);
	});

	test("a Prettier reflow of a kept expect is not drift", () => {
		const reflowed = text(SIZE_SPEC).replace(
			SIZE_STATEMENT,
			'await expect(sizeCell).toHaveText(\n\t\t\t"0 B",\n\t\t);',
		);
		expect(check(real, withText(SIZE_SPEC, reflowed))).toEqual([]);
	});

	test("a template-literal title is dynamic-title and a modified test is not live", () => {
		const planted = `\n${RUN}(\`planted \${1}\`, async () => {\n\texpect(1).toBe(1);\n});\n`;
		expect(
			check(real, withText("accessibility", text("accessibility") + planted)),
		).toEqual(["dynamic-title"]);
		const title = "has DevTools closed on launch";
		const modified = text("app-launch").replace(
			`${RUN}("${title}"`,
			`${RUN}.${SKIP}("${title}"`,
		);
		expect(check(real, withText("app-launch", modified))).toEqual(["stale"]);
	});
});

interface Mutant {
	name: string;
	code: string;
	codes: () => string[];
}

const MUTANTS: Mutant[] = [
	{
		name: "baselineCommit with a leading dash",
		code: "bad-baseline",
		codes: () => check({ ...clone(), baselineCommit: "-x" }),
	},
	{
		name: "covers outside the vocabulary",
		code: "bad-covers",
		codes: () => codesOf(deletedFixture({ covers: "color" })),
	},
	{
		name: "kept item with a reason outside the vocabulary",
		code: "bad-reason",
		codes: () => {
			const doc = clone();
			at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0).reason = "because";
			return check(doc);
		},
	},
	{
		name: "deleted item without a story",
		code: "bad-shape",
		codes: () => {
			const fixture = deletedFixture();
			delete at(entryOf(fixture.doc, SIZE_SPEC, SIZE_TITLE).items, 1).story;
			return codesOf(fixture);
		},
	},
	{
		name: "specs that is an array",
		code: "bad-type",
		codes: () => check({ ...clone(), specs: [] }),
	},
	{
		name: "a ledger missing one baseline item",
		code: "baseline-drift",
		codes: () => {
			const doc = clone();
			at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 1);
			entryOf(doc, SIZE_SPEC, SIZE_TITLE).items.pop();
			return baselineCodes(doc);
		},
	},
	{
		name: "a baseline commit git cannot find",
		code: "baseline-missing",
		codes: () =>
			baselineCodes(
				{ ...clone(), baselineCommit: "1".repeat(40) },
				{ git: ABSENT_GIT },
			),
	},
	{
		name: "a baseline commit that is not an ancestor of HEAD",
		code: "baseline-not-ancestor",
		codes: () =>
			baselineCodes(
				{ ...clone(), baselineCommit: "2".repeat(40) },
				{ git: ORPHAN_GIT },
			),
	},
	{
		name: "a repeated test title in a spec",
		code: "duplicate-title",
		codes: () =>
			check(
				real,
				withText(
					"app-launch",
					`${text("app-launch")}\n${RUN}("has DevTools closed on launch", async () => {});\n`,
				),
			),
	},
	{
		name: "a template-literal test title",
		code: "dynamic-title",
		codes: () =>
			check(
				real,
				withText(
					"accessibility",
					`${text("accessibility")}\n${RUN}(\`planted \${1}\`, async () => {});\n`,
				),
			),
	},
	{
		name: "evidence absent from the story scope",
		code: "evidence-missing",
		codes: () =>
			codesOf(deletedFixture({ evidence: "No such literal anywhere" })),
	},
	{
		name: "a kept code that no longer matches the live expect",
		code: "kept-drift",
		codes: () => {
			const doc = clone();
			const item = at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0);
			item.code = `${item.code} `;
			return check(doc);
		},
	},
	{
		name: "a missing spec key",
		code: "missing-field",
		codes: () => {
			const doc = clone();
			delete doc.specs["i18n"];
			return check(doc);
		},
	},
	{
		name: "an all-deleted entry whose test still exists",
		code: "not-deleted",
		codes: () => {
			const doc = clone();
			turnIntoDeleted(
				at(
					entryOf(doc, "app-launch", "has DevTools closed on launch").items,
					0,
				),
				{},
			);
			return check(doc);
		},
	},
	{
		name: "a ledger that is an array",
		code: "not-object",
		codes: () => check([]),
	},
	{
		name: "schemaVersion 2",
		code: "schema-version",
		codes: () => check({ ...clone(), schemaVersion: 2 }),
	},
	{
		name: "a kept entry whose test is skipped",
		code: "stale",
		codes: () =>
			check(
				real,
				withText(
					SIZE_SPEC,
					text(SIZE_SPEC).replace(
						`${RUN}("shows the real byte size of a processed file"`,
						`${RUN}.${SKIP}("shows the real byte size of a processed file"`,
					),
				),
			),
	},
	{
		name: "a deleted item naming a story that does not exist",
		code: "story-missing",
		codes: () => codesOf(deletedFixture({ story: "ui-nonesuch--missing" })),
	},
	{
		name: "a story whose component is not the subject",
		code: "subject-mismatch",
		codes: () => codesOf(deletedFixture({ subject: "DropZone" })),
	},
	{
		name: "an unknown item key",
		code: "unknown-field",
		codes: () => {
			const doc = clone();
			at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0)["extra"] = 1;
			return check(doc);
		},
	},
	{
		name: "a live test with no ledger entry",
		code: "unledgered",
		codes: () => {
			const doc = clone();
			specOf(doc, SIZE_SPEC).splice(0, 1);
			return check(doc);
		},
	},
];

describe("every rule code is shown red by its own mutant", () => {
	test.each(MUTANTS)("shown red: $name -> $code", ({ code, codes }) => {
		expect(codes()).toEqual([code]);
	});

	test("a focus-order item needs toHaveFocus in the story scope", () => {
		const fixture = deletedFixture({ covers: "focus-order" });
		expect(codesOf(fixture)).toEqual([]);
		const scopes = new Map(allScopes);
		const empty = scopes.get("screens-app--empty");
		if (empty === undefined) throw new Error("no screens-app--empty scope");
		scopes.set("screens-app--empty", {
			...empty,
			scope: empty.scope.replaceAll("toHaveFocus", "toBeEnabled"),
		});
		// The fixture item is red, and so is every real focus-order item, because they cite
		// the same story and the same literal.
		const realFocusOrder = Object.values(real.specs)
			.flat()
			.flatMap((entry) => entry.items)
			.filter(
				(item) => item.verdict === "deleted" && item.covers === "focus-order",
			).length;
		expect(check(fixture.doc, fixture.specTexts, scopes)).toEqual(
			Array.from({ length: realFocusOrder + 1 }, () => "evidence-missing"),
		);
	});

	test("the mutant codes are exactly TEST_SHIFT_CODES", () => {
		expect([...new Set(MUTANTS.map((mutant) => mutant.code))].sort()).toEqual([
			...TEST_SHIFT_CODES,
		]);
	});

	test("TEST_SHIFT_CODES is 21 frozen codes sorted by code unit", () => {
		expect(TEST_SHIFT_CODES).toHaveLength(21);
		expect(Object.isFrozen(TEST_SHIFT_CODES)).toBe(true);
		expect([...TEST_SHIFT_CODES]).toEqual([...TEST_SHIFT_CODES].sort());
		expect(Object.isFrozen(LEDGER_SPECS)).toBe(true);
		expect([...LEDGER_SPECS]).toEqual([...LEDGER_SPECS].sort());
	});
});

describe("the baseline commit is read from git and fails closed", () => {
	test("the real repository matches its baseline", () => {
		expect(baselineCodes(real)).toEqual([]);
	});

	test("the baseline walk holds 26 tests and 78 expects", () => {
		const git = (args: string[]): string => {
			const result = spawnSync("git", args, {
				cwd: repoRoot,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
			});
			expect(result.status, result.stderr).toBe(0);
			return result.stdout;
		};
		let tests = 0;
		let expects = 0;
		for (const spec of LEDGER_SPECS) {
			const walk = e2eAssertions({
				text: git(["show", `${real.baselineCommit}:tests/e2e/${spec}.spec.ts`]),
				file: `${spec}.spec.ts`,
			});
			tests += walk.tests.length;
			expects += walk.tests.reduce((sum, t) => sum + t.expects.length, 0);
		}
		expect({ tests, expects }).toEqual({ tests: 26, expects: 78 });
	});

	test("a malformed baselineCommit is bad-baseline before any git call", () => {
		for (const sha of ["-x", "a".repeat(39), "A".repeat(40), "--output=x"]) {
			const doc = { ...clone(), baselineCommit: sha };
			expect(baselineCodes(doc, { git: NO_GIT }), sha).toEqual([
				"bad-baseline",
			]);
		}
		expect(baselineCodes([], { git: NO_GIT })).toEqual(["bad-baseline"]);
	});

	test("a well-formed absent sha is baseline-missing and an orphan commit is baseline-not-ancestor", () => {
		const repo = makeCatalogRepo();
		try {
			const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
				cwd: repo,
				encoding: "utf8",
				env: GIT_ENV,
			}).stdout.trim();
			const orphan = spawnSync("git", ["commit-tree", tree, "-m", "orphan"], {
				cwd: repo,
				encoding: "utf8",
				env: GIT_ENV,
			}).stdout.trim();
			expect(orphan).toMatch(/^[0-9a-f]{40}$/);
			const before = snapshotDir(repo);
			expect(
				checkTestShiftBaseline(repo, {
					...clone(),
					baselineCommit: "1".repeat(40),
				}).map((found) => found.code),
			).toEqual(["baseline-missing"]);
			expect(
				checkTestShiftBaseline(repo, {
					...clone(),
					baselineCommit: orphan,
				}).map((found) => found.code),
			).toEqual(["baseline-not-ancestor"]);
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});
});

function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[]) {
	return runNode(realScript(CATALOG), args, repo);
}

// Edit a file inside the temp repo; the planted edit must change it (anti-vacuity).
function plant(
	repo: string,
	rel: string,
	mutate: (original: string) => string,
) {
	const file = path.join(repo, rel);
	const original = fs.readFileSync(file, "utf8");
	fs.writeFileSync(file, mutate(original));
	expect(fs.readFileSync(file, "utf8")).not.toBe(original);
}

function plantLedger(repo: string, mutate: (doc: Ledger) => void) {
	plant(repo, TEST_SHIFT_PATH, (original) => {
		const doc = JSON.parse(original) as Ledger;
		mutate(doc);
		return jsonText(doc);
	});
}

function plantSpec(
	repo: string,
	spec: string,
	mutate: (original: string) => string,
) {
	plant(repo, `tests/e2e/${spec}.spec.ts`, mutate);
}

// A deleted item in the temp ledger, with its expect removed from the temp spec.
function plantDeleted(
	repo: string,
	over: Record<string, unknown> = {},
	drop: string[] = [],
) {
	plantLedger(repo, (doc) => {
		const item = at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 1);
		turnIntoDeleted(item, over);
		for (const key of drop) delete item[key];
	});
	plantSpec(repo, SIZE_SPEC, (original) =>
		removeStatement(original, SIZE_TITLE, SIZE_STATEMENT),
	);
}

function expectRed(result: ReturnType<typeof run>, codes: string[]): void {
	expect(result.status, result.stdout + result.stderr).toBe(1);
	expect(result.stderr).toContain("CATALOG CHECK FAILED");
	for (const code of codes) expect(result.stderr).toContain(code);
}

describe("catalog.mjs --check against a temp git repository", () => {
	test("the unplanted repository passes with nine generated files current", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stdout + result.stderr).toBe(0);
			expect(result.stdout).toContain("9 generated files current");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: an edited TEST-SHIFT.md fails --check with stale and changes nothing", () => {
		withRepo((repo) => {
			plant(repo, TEST_SHIFT_MD_PATH, (original) => `${original}\nextra\n`);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), [
				"stale",
				"TEST-SHIFT.md",
			]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a deleted item naming no story fails with story-missing and changes nothing", () => {
		withRepo((repo) => {
			plantDeleted(repo, { story: "ui-nonesuch--missing" });
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["story-missing"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a new test with no ledger entry fails with unledgered and changes nothing", () => {
		withRepo((repo) => {
			plantSpec(
				repo,
				"accessibility",
				(original) =>
					`${original}\n${RUN}("a planted test with no ledger entry", async () => {\n\texpect(1).toBe(1);\n});\n`,
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["unledgered"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a renamed ledger test is both stale and unledgered", () => {
		withRepo((repo) => {
			plantSpec(repo, "app-launch", (original) =>
				original.replace(
					`${RUN}("has DevTools closed on launch"`,
					`${RUN}("has DevTools closed on launch, renamed"`,
				),
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), [
				"stale",
				"unledgered",
			]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a kept item with no reason or an unknown reason fails with bad-reason", () => {
		withRepo((repo) => {
			plantLedger(repo, (doc) => {
				delete at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0).reason;
			});
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["bad-reason"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
		withRepo((repo) => {
			plantLedger(repo, (doc) => {
				at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0).reason = "because";
			});
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["bad-reason"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a deleted item with no story, or with both story and reason, fails with bad-shape", () => {
		withRepo((repo) => {
			plantDeleted(repo, {}, ["story"]);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["bad-shape"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
		withRepo((repo) => {
			plantDeleted(repo, { reason: "real-electron" });
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["bad-shape"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: an unknown item key fails with unknown-field", () => {
		withRepo((repo) => {
			plantLedger(repo, (doc) => {
				at(entryOf(doc, SIZE_SPEC, SIZE_TITLE).items, 0)["extra"] = 1;
			});
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["unknown-field"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: an all-deleted entry whose test remains fails with not-deleted", () => {
		withRepo((repo) => {
			plantLedger(repo, (doc) => {
				turnIntoDeleted(
					at(
						entryOf(doc, "app-launch", "has DevTools closed on launch").items,
						0,
					),
					{},
				);
			});
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["not-deleted"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a changed live expect, and a duplicated expect line, fail with kept-drift", () => {
		withRepo((repo) => {
			plantSpec(repo, SIZE_SPEC, (original) =>
				original.replace(
					SIZE_STATEMENT,
					'await expect(sizeCell).toHaveText("0 KB");',
				),
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["kept-drift"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
		withRepo((repo) => {
			plantSpec(repo, SIZE_SPEC, (original) =>
				original.replace(
					SIZE_STATEMENT,
					`${SIZE_STATEMENT}\n\t\t\t${SIZE_STATEMENT}`,
				),
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["kept-drift"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a focus-order item whose story lacks toHaveFocus fails with evidence-missing", () => {
		withRepo((repo) => {
			plantDeleted(repo, { covers: "focus-order" });
			plant(
				repo,
				"src/renderer/components/screens/App.stories.tsx",
				(original) => original.replaceAll("toHaveFocus", "toBeEnabled"),
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["evidence-missing"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: an evidence literal absent from the story scope fails with evidence-missing", () => {
		withRepo((repo) => {
			plantDeleted(repo, { evidence: "No such literal anywhere" });
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["evidence-missing"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a story whose component is not the subject fails with subject-mismatch", () => {
		withRepo((repo) => {
			plantDeleted(repo, { subject: "DropZone" });
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["subject-mismatch"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("a Prettier reflow of a kept expect keeps --check green and changes nothing", () => {
		withRepo((repo) => {
			plantSpec(repo, SIZE_SPEC, (original) =>
				original.replace(
					SIZE_STATEMENT,
					'await expect(sizeCell).toHaveText(\n\t\t\t"0 B",\n\t\t);',
				),
			);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stdout + result.stderr).toBe(0);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a template-literal title fails with dynamic-title, a skipped test with stale", () => {
		withRepo((repo) => {
			plantSpec(
				repo,
				"accessibility",
				(original) =>
					`${original}\n${RUN}(\`planted \${1}\`, async () => {\n\texpect(1).toBe(1);\n});\n`,
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["dynamic-title"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
		withRepo((repo) => {
			plantSpec(repo, "app-launch", (original) =>
				original.replace(
					`${RUN}("has DevTools closed on launch"`,
					`${RUN}.${SKIP}("has DevTools closed on launch"`,
				),
			);
			const before = snapshotDir(repo);
			expectRed(run(repo, ["--check", "--base", "main"]), ["stale"]);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});
