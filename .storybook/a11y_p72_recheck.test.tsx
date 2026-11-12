import {
	composeStories,
	composeStory,
	setProjectAnnotations,
} from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { describe, expect, test } from "vitest";
import baseline from "../docs/evidence/known-findings.json";
import preview from "./preview";
import * as fixtureStories from "./fixtures/a11y_recheck.stories";

// SC2 / D-21 (72-05): the a11y-p72 baseline kind is sealed, so it can only shrink. This
// file keeps it honest in the three ways it could otherwise drift:
//   (a) the (story id, rule) pairs that stories disable equal the baseline entries,
//       both ways: no story silences a rule without an entry, no entry outlives its
//       story's disable;
//   (b) every entry still reproduces: re-enabling its rule on its story makes the
//       story run reject naming that rule in at least one theme (theme-union: some
//       entries fail in light only), else the entry is stale and the test says
//       `fixed, remove the entry <fingerprint>` (the ratchet lets entries go);
//   (c) no `src/` story silences the gate any other way. @storybook/addon-a11y's
//       afterEach skips or empties the scan on: parameters.a11y.test other than
//       "error", parameters.a11y.disable, globals.a11y.manual, globals.ghostStories,
//       parameters.a11y.context (include/exclude), and options.runOnly. Every route is
//       checked on every story of the catalog's own glob (`*.stories.@(ts|tsx)`,
//       asserted equal to STORIES_GLOB in catalog/story_index.test.ts).
//       This closes the interim audit's per-story bypass for src stories (RESEARCH C8).
//
// Accepted residual: a baselined story and rule hides a NEW instance of the same rule
// in that same story (the entry disables the rule for the whole story, and the
// re-check only proves the rule still fires somewhere in it). The remedy is the
// entry's own `fix-v5.1` disposition, not a finer gate.
//
// Runs in the `storybook-a11y-gate` browser project (VITEST_STORYBOOK=false, the only
// setting under which addon-a11y throws on a violation). Re-enabling goes through
// composeStory over a spread annotation object (S-11: Story.run({ parameters })
// replaces the WHOLE parameters object and would drop the copy-lint fixtureText), and
// the theme through the annotation's own `globals`.
setProjectAnnotations([a11yAnnotations, preview]);

type CsfModule = Parameters<typeof composeStories>[0];
type Theme = "light" | "dark";
const THEMES: readonly Theme[] = ["light", "dark"];

type Entry = { fingerprint: string; kind: string; story: string; rule: string };
type Indexed = {
	id: string;
	name: string;
	module: CsfModule;
	parameters: Record<string, unknown>;
	// The CSF globals (module default, then the story's own): addon-a11y reads
	// globals.a11y.manual and globals.ghostStories, which parameters cannot show.
	globals: Record<string, unknown>;
};
export type Runner = (
	storyId: string,
	rule: string,
	theme: Theme,
) => Promise<string | null>;

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function isA11yKind(kind: string): boolean {
	return kind === "a11y" || kind.startsWith("a11y-");
}

// Every story of the given CSF modules, composed with the project annotations.
function indexStories(modules: Record<string, CsfModule>): Indexed[] {
	const out: Indexed[] = [];
	for (const module of Object.values(modules)) {
		for (const [name, story] of Object.entries(composeStories(module))) {
			// composeStories is typed loosely for an untyped module namespace.
			// A composed story is a callable carrying id and parameters.
			const composed: unknown = story;
			if (
				typeof composed !== "function" ||
				!("id" in composed) ||
				typeof composed.id !== "string"
			) {
				throw new Error(`story ${name} has no id`);
			}
			const exports = record(module);
			out.push({
				id: composed.id,
				name,
				module,
				parameters: record("parameters" in composed ? composed.parameters : {}),
				globals: {
					...record(record(exports["default"])["globals"]),
					...record(record(exports[name])["globals"]),
				},
			});
		}
	}
	return out;
}

// The rules a story switches off, from options.rules and config.rules.
function disabledRules(parameters: Record<string, unknown>): string[] {
	const a11y = record(parameters["a11y"]);
	const rules: string[] = [];
	for (const source of [a11y["options"], a11y["config"]]) {
		for (const [rule, setting] of Object.entries(
			record(record(source)["rules"]),
		)) {
			if (record(setting)["enabled"] === false) rules.push(rule);
		}
	}
	return rules;
}

export function disabledPairs(
	stories: ReadonlyArray<{ id: string; parameters: Record<string, unknown> }>,
): string[] {
	return stories
		.flatMap((story) =>
			disabledRules(story.parameters).map((rule) => `${story.id}|${rule}`),
		)
		.sort(compare);
}

export function entryPairs(entries: readonly Entry[]): string[] {
	return entries.map((entry) => `${entry.story}|${entry.rule}`).sort(compare);
}

export function pairProblems(
	disabled: readonly string[],
	entries: readonly string[],
): string[] {
	return [
		...disabled
			.filter((pair) => !entries.includes(pair))
			.map((pair) => `story disables ${pair} with no baseline entry`),
		...entries
			.filter((pair) => !disabled.includes(pair))
			.map((pair) => `baseline entry ${pair} has no story that disables it`),
	].sort(compare);
}

export function bypassProblems(
	stories: ReadonlyArray<{
		id: string;
		parameters: Record<string, unknown>;
		globals?: Record<string, unknown>;
	}>,
): string[] {
	const problems: string[] = [];
	for (const story of stories) {
		const a11y = record(story.parameters["a11y"]);
		const globals = story.globals ?? {};
		if (a11y["test"] !== "error") {
			problems.push(
				`${story.id}: parameters.a11y.test is ${JSON.stringify(a11y["test"])}, not "error"`,
			);
		}
		if (a11y["disable"] === true) {
			problems.push(`${story.id}: parameters.a11y.disable is true`);
		}
		if (record(globals["a11y"])["manual"] === true) {
			problems.push(`${story.id}: globals.a11y.manual is true`);
		}
		if (globals["ghostStories"]) {
			problems.push(`${story.id}: globals.ghostStories is set`);
		}
		if (a11y["context"] !== undefined) {
			problems.push(`${story.id}: parameters.a11y.context is set`);
		}
		if (record(a11y["options"])["runOnly"] !== undefined) {
			problems.push(`${story.id}: parameters.a11y.options.runOnly is set`);
		}
	}
	return problems.sort(compare);
}

// Runs the story with `rule` re-enabled and the theme set; null when it passes,
// else the rejection message.
export function makeRunner(index: readonly Indexed[]): Runner {
	return async (storyId, rule, theme) => {
		const hit = index.find((story) => story.id === storyId);
		if (hit === undefined) throw new Error(`no story ${storyId}`);
		const exports = record(hit.module);
		const annotations = record(exports[hit.name]);
		const parameters = record(annotations["parameters"]);
		const a11y = record(parameters["a11y"]);
		const options = record(a11y["options"]);
		const reenabled = {
			...annotations,
			globals: { ...record(annotations["globals"]), theme },
			parameters: {
				...parameters,
				a11y: {
					...a11y,
					options: {
						...options,
						rules: {
							...record(options["rules"]),
							[rule]: { enabled: true },
						},
					},
				},
			},
		};
		const story = composeStory(
			reenabled,
			record(exports["default"]),
			undefined,
			hit.name,
		);
		try {
			await story.run();
			return null;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	};
}

export async function recheckProblems(
	entries: readonly Entry[],
	runner: Runner,
): Promise<string[]> {
	const problems: string[] = [];
	for (const entry of entries) {
		let reproduced = false;
		for (const theme of THEMES) {
			const message = await runner(entry.story, entry.rule, theme);
			if (message !== null && message.includes(entry.rule)) {
				reproduced = true;
				break;
			}
		}
		if (!reproduced)
			problems.push(`fixed, remove the entry ${entry.fingerprint}`);
	}
	return problems;
}

// Must equal STORIES_GLOB (catalog/story_index.mjs); story_index.test.ts reads this
// literal back and asserts it, because import.meta.glob needs a string literal.
const realModules = import.meta.glob<CsfModule>(
	"../src/renderer/**/*.stories.@(ts|tsx)",
	{ eager: true },
);
const REAL_STORIES = indexStories(realModules);
const REAL_ENTRIES: Entry[] = baseline.entries.filter((entry) =>
	isA11yKind(entry.kind),
);
const FIXTURE_STORIES = indexStories({ fixture: fixtureStories });
const fixtureRunner = makeRunner(FIXTURE_STORIES);
const realRunner = makeRunner(REAL_STORIES);

const PASSING_ID = "fixtures-a11yrecheck--passing";
const FRESH_ID = "fixtures-a11yrecheck--fresh-violation";

function plantedEntry(story: string, rule: string): Entry {
	return {
		fingerprint: `a11y-p72|${story}|${rule}`,
		kind: "a11y-p72",
		story,
		rule,
	};
}

// Each control below runs one to four axe passes in a real browser. The gate project sets
// no testTimeout, so the 15 s browser default applied and a loaded host could time one
// out before it asserted anything (review WR-01).
const CONTROL_TIMEOUT_MS = 60_000;

describe("a11y-p72 baseline (SC2, D-21)", () => {
	test("the stories that disable a rule are exactly the baseline entries", () => {
		expect(REAL_STORIES.length).toBeGreaterThan(50);
		expect(REAL_ENTRIES.length).toBeGreaterThan(0);
		const disabled = disabledPairs(REAL_STORIES);
		const entries = entryPairs(REAL_ENTRIES);
		expect(pairProblems(disabled, entries)).toEqual([]);
		expect(disabled).toEqual(entries);
		expect(disabled.length).toBe(REAL_ENTRIES.length);
		expect(
			baseline.entries.filter((entry) => entry.kind === "a11y-p72").length,
		).toBe(REAL_ENTRIES.length);
	});

	test("a planted disable without an entry, and an entry without a disable, are each reported", () => {
		const planted = [
			...REAL_STORIES,
			{
				id: "planted--story",
				name: "Story",
				module: {} as CsfModule,
				globals: {},
				parameters: {
					a11y: { options: { rules: { "fake-rule": { enabled: false } } } },
				},
			},
		];
		expect(
			pairProblems(disabledPairs(planted), entryPairs(REAL_ENTRIES)),
		).toEqual([
			"story disables planted--story|fake-rule with no baseline entry",
		]);
		expect(
			pairProblems(disabledPairs(REAL_STORIES), [
				...entryPairs(REAL_ENTRIES),
				"gone--story|color-contrast",
			]),
		).toEqual([
			"baseline entry gone--story|color-contrast has no story that disables it",
		]);
	});

	test("every src story's effective a11y test is error and none sets disable", () => {
		expect(bypassProblems(REAL_STORIES)).toEqual([]);
	});

	test("the bypass scan reports a todo, an off, a missing and a disabled gate", () => {
		expect(
			bypassProblems([
				{ id: "a", parameters: { a11y: { test: "todo" } } },
				{ id: "b", parameters: { a11y: { test: "off" } } },
				{ id: "c", parameters: {} },
				{ id: "d", parameters: { a11y: { test: "error", disable: true } } },
				{ id: "e", parameters: { a11y: { test: "error" } } },
			]),
		).toEqual([
			'a: parameters.a11y.test is "todo", not "error"',
			'b: parameters.a11y.test is "off", not "error"',
			'c: parameters.a11y.test is undefined, not "error"',
			"d: parameters.a11y.disable is true",
		]);
	});

	test("the bypass scan reports each remaining route that addon-a11y honours", () => {
		const ok = { a11y: { test: "error" } };
		// One planted story per route, each otherwise clean, so a problem names its route.
		expect(
			bypassProblems([
				{ id: "manual", parameters: ok, globals: { a11y: { manual: true } } },
				{ id: "ghost", parameters: ok, globals: { ghostStories: true } },
				{
					id: "context",
					parameters: {
						a11y: { test: "error", context: { exclude: ["body"] } },
					},
				},
				{
					id: "runonly",
					parameters: {
						a11y: { test: "error", options: { runOnly: ["button-name"] } },
					},
				},
				{ id: "clean", parameters: ok, globals: { a11y: { manual: false } } },
			]),
		).toEqual([
			"context: parameters.a11y.context is set",
			"ghost: globals.ghostStories is set",
			"manual: globals.a11y.manual is true",
			"runonly: parameters.a11y.options.runOnly is set",
		]);
	});

	test("globals set in a story module's CSF, on the story or on the meta, reach the scan", () => {
		// The scan only sees what indexStories hands it, so plant real CSF modules.
		const planted = indexStories({
			story: {
				default: { title: "Planted/StoryGlobals" },
				Manual: { render: () => null, globals: { a11y: { manual: true } } },
				Fine: { render: () => null },
			} as CsfModule,
			meta: {
				default: {
					title: "Planted/MetaGlobals",
					globals: { ghostStories: true },
					parameters: { a11y: { context: { exclude: ["body"] } } },
				},
				Any: { render: () => null },
			} as CsfModule,
		});
		expect(bypassProblems(planted)).toEqual([
			"planted-metaglobals--any: globals.ghostStories is set",
			"planted-metaglobals--any: parameters.a11y.context is set",
			"planted-storyglobals--manual: globals.a11y.manual is true",
		]);
	});

	test(
		"every entry still reproduces with its rule re-enabled, in light or dark",
		{ timeout: 600_000 },
		async () => {
			const started = Date.now();
			expect(await recheckProblems(REAL_ENTRIES, realRunner)).toEqual([]);
			// Recorded as the A11y re-check line in 72-EVIDENCE.md.
			console.info(
				`A11y re-check (72-05): ${REAL_ENTRIES.length} entries, ${Math.ceil((Date.now() - started) / 1000)}s, 0 problems`,
			);
		},
	);
});

describe("a11y-p72 re-check controls (planted, never red on disk)", () => {
	test(
		"a planted entry for a story that passes is reported as fixed",
		async () => {
			const entry = plantedEntry(PASSING_ID, "color-contrast");
			expect(await recheckProblems([entry], fixtureRunner)).toEqual([
				`fixed, remove the entry ${entry.fingerprint}`,
			]);
		},
		CONTROL_TIMEOUT_MS,
	);

	test(
		"a story with color-contrast disabled and a nameless button still rejects with button-name",
		async () => {
			const fresh = composeStories(fixtureStories)["FreshViolation"];
			expect(fresh.id).toBe(FRESH_ID);
			await expect(fresh.run()).rejects.toThrow(/button-name/);
		},
		CONTROL_TIMEOUT_MS,
	);

	test(
		"re-enabling the disabled rule on the planted story adds color-contrast to the rejection",
		async () => {
			const message = await fixtureRunner(FRESH_ID, "color-contrast", "light");
			expect(message).toContain("color-contrast");
		},
		CONTROL_TIMEOUT_MS,
	);

	test(
		"the real ToggleSwitch light-only entry stays green: it fails in light and passes in dark (theme-union)",
		async () => {
			const story = "settings-toggleswitch--on";
			const light = await realRunner(story, "color-contrast", "light");
			const dark = await realRunner(story, "color-contrast", "dark");
			expect(light).toContain("color-contrast");
			expect(dark).toBeNull();
			expect(
				await recheckProblems(
					[plantedEntry(story, "color-contrast")],
					realRunner,
				),
			).toEqual([]);
		},
		CONTROL_TIMEOUT_MS,
	);
});
