import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { canonicalJson } from "./closed.mjs";
import {
	MANIFEST_CODES,
	SCENARIOS_PATH,
	checkManifest,
	loadManifestInputs,
	type ManifestDocument,
	type ManifestInputs,
	type ManifestScenario,
} from "./manifest.mjs";
import { enumerateFile } from "./story_index.mjs";
import { SUBJECTS_PATH } from "./subjects.mjs";
import { repoRoot } from "./temp_repo";

const inputs = await loadManifestInputs(repoRoot);
const scenariosText = fs.readFileSync(
	path.join(repoRoot, SCENARIOS_PATH),
	"utf8",
);
const subjectsText = fs.readFileSync(
	path.join(repoRoot, SUBJECTS_PATH),
	"utf8",
);
const real = JSON.parse(scenariosText) as ManifestDocument;

function isSorted(ids: string[]): boolean {
	return ids.every((id, index) => index === 0 || (ids[index - 1] ?? "") <= id);
}

describe("the real manifest", () => {
	test("the real manifest against the real stories, catalog and subjects is clean", () => {
		expect(checkManifest(inputs)).toEqual([]);
	});

	test("anti-vacuity: the run saw the LanguageDropdown stories and both Phase 70 seed scenarios", () => {
		const ids = inputs.stories.map((story) => story.id);
		expect(ids.length).toBeGreaterThanOrEqual(3);
		expect(ids).toContain("settings-languagedropdown--default");
		expect(ids).toContain("settings-languagedropdown--arabic");
		expect(ids).toContain("settings-languagedropdown--persian");
		const scenarioIds = real.scenarios.map((scenario) => scenario.id);
		expect(scenarioIds).toContain("language-dropdown.rtl-locales");
		expect(scenarioIds).toContain("language-dropdown.system-default");
		expect(scenarioIds.length).toBeGreaterThanOrEqual(2);
	});

	test("canonical form: scenarios.json is canonicalJson of its parse, sorted by id", () => {
		expect(scenariosText).toBe(canonicalJson(real));
		const ids = real.scenarios.map((scenario) => scenario.id);
		expect(isSorted(ids)).toBe(true);
		// The sort check is shown red on an unsorted clone.
		expect(isSorted([...ids].reverse())).toBe(false);
	});

	test("canonical form: subjects.json is canonicalJson of its parse, sorted by id", () => {
		const subjects = JSON.parse(subjectsText) as Array<{
			id: string;
			tier: string;
		}>;
		expect(subjectsText).toBe(canonicalJson(subjects));
		const ids = subjects.map((subject) => subject.id);
		expect(isSorted(ids)).toBe(true);
		expect(isSorted([...ids].reverse())).toBe(false);
	});
});

const SYSTEM = "language-dropdown.system-default";
const RTL = "language-dropdown.rtl-locales";
const DEFAULT_STORY = "settings-languagedropdown--default";
const ARABIC = "settings-languagedropdown--arabic";
const PERSIAN = "settings-languagedropdown--persian";

function seed(id: string): ManifestScenario {
	const found = real.scenarios.find((scenario) => scenario.id === id);
	if (found === undefined) throw new Error(`no seed scenario ${id}`);
	return found;
}

function withScenarios(scenarios: object[]): ManifestInputs {
	return { ...inputs, manifest: { schemaVersion: 1, scenarios } };
}

// Replace one seed scenario's fields, keeping the other as it is.
function patched(id: string, patch: object): ManifestInputs {
	return withScenarios(
		real.scenarios.map((scenario) =>
			scenario.id === id ? { ...scenario, ...patch } : scenario,
		),
	);
}

function withoutKey(id: string, key: string): ManifestInputs {
	return withScenarios(
		real.scenarios.map((scenario) => {
			if (scenario.id !== id) return scenario;
			const copy: Record<string, unknown> = { ...scenario };
			delete copy[key];
			return copy;
		}),
	);
}

function withStory(
	storyId: string,
	patch: { title?: string | null; component?: string | null },
): ManifestInputs {
	return {
		...inputs,
		stories: inputs.stories.map((story) =>
			story.id === storyId ? { ...story, ...patch } : story,
		),
	};
}

type Brief = { code: string; scenario?: string; story?: string };

function brief(run: ManifestInputs): Brief[] {
	return checkManifest(run).map(({ code, scenario, story }) => ({
		code,
		...(scenario === undefined ? {} : { scenario }),
		...(story === undefined ? {} : { story }),
	}));
}

// Existing files the proofRef rule may name.
function firstFile(dir: string, suffix: string): string {
	const name = fs
		.readdirSync(path.join(repoRoot, dir))
		.sort()
		.find((entry) => entry.endsWith(suffix));
	if (name === undefined) throw new Error(`no ${suffix} file in ${dir}`);
	return `${dir}/${name}`;
}
const E2E_SPEC = firstFile("tests/e2e", ".spec.ts");
const UNIT_TEST = firstFile("tests/renderer", ".test.ts");

// One planted defect per code, each yielding exactly one problem (the blast
// radius assertion). The named rows are the four criterion reds: an unknown id
// (persona, job, state class and tier), a missing situation, a story absent
// from the manifest and a manifest entry with no story.
const DEFECTS: ReadonlyArray<[string, () => ManifestInputs, Brief]> = [
	[
		"not an object",
		() => ({ ...inputs, manifest: [] }),
		{ code: "not-object" },
	],
	[
		"schema version 2",
		() => ({ ...inputs, manifest: { ...real, schemaVersion: 2 } }),
		{ code: "schema-version" },
	],
	[
		"unknown scenario field",
		() => patched(SYSTEM, { colour: "red" }),
		{ code: "unknown-field", scenario: SYSTEM },
	],
	[
		"bad scenario id",
		() => patched(SYSTEM, { id: "BadId" }),
		{ code: "bad-id", scenario: "BadId" },
	],
	[
		"duplicate scenario id",
		() => withScenarios([...real.scenarios, seed(SYSTEM)]),
		{ code: "duplicate-id", scenario: SYSTEM },
	],
	[
		"unknown persona id",
		() => patched(SYSTEM, { persona: "P-nobody" }),
		{ code: "unknown-persona", scenario: SYSTEM },
	],
	[
		"unknown job id",
		() => patched(SYSTEM, { job: "J-99" }),
		{ code: "unknown-job", scenario: SYSTEM },
	],
	[
		"unknown state class",
		() => patched(SYSTEM, { stateClass: "sad" }),
		{ code: "unknown-state-class", scenario: SYSTEM },
	],
	[
		"unknown tier",
		() => patched(SYSTEM, { tier: "widget" }),
		{ code: "unknown-tier", scenario: SYSTEM },
	],
	[
		"unknown proof boundary",
		() => patched(SYSTEM, { proofBoundary: "e2e" }),
		{ code: "unknown-proof-boundary", scenario: SYSTEM },
	],
	[
		"unknown subject",
		() => withStory(DEFAULT_STORY, { component: "NoSuchComponent" }),
		{ code: "unknown-subject", scenario: SYSTEM },
	],
	[
		"missing situation",
		() => withoutKey(SYSTEM, "situation"),
		{ code: "missing-situation", scenario: SYSTEM },
	],
	[
		"banned situation",
		() => patched(SYSTEM, { situation: "Just open it" }),
		{ code: "situation-banned", scenario: SYSTEM },
	],
	[
		"manifest entry with no story",
		() =>
			withScenarios([
				...real.scenarios,
				{ ...seed(SYSTEM), id: "language-dropdown.nothing", stories: [] },
			]),
		{ code: "missing-stories", scenario: "language-dropdown.nothing" },
	],
	[
		"listed story does not exist",
		() =>
			patched(SYSTEM, {
				stories: [DEFAULT_STORY, "settings-languagedropdown--gone"],
			}),
		{
			code: "story-missing",
			scenario: SYSTEM,
			story: "settings-languagedropdown--gone",
		},
	],
	[
		"story absent from manifest",
		() => withScenarios(real.scenarios.filter((s) => s.id !== SYSTEM)),
		{ code: "story-unmapped", story: DEFAULT_STORY },
	],
	[
		"story listed by two scenarios",
		() => patched(SYSTEM, { stories: [DEFAULT_STORY, ARABIC] }),
		{ code: "story-double-mapped", scenario: SYSTEM, story: ARABIC },
	],
	[
		"story without a title",
		() => withStory(ARABIC, { title: null }),
		{ code: "missing-title", story: ARABIC },
	],
	[
		"story without a component",
		() => withStory(ARABIC, { component: null }),
		{ code: "missing-component", story: ARABIC },
	],
	[
		"stories of one scenario with two components",
		() => withStory(PERSIAN, { component: "FileRow" }),
		{ code: "mixed-subject", scenario: RTL },
	],
	[
		"tier that is not the subject tier",
		() => patched(SYSTEM, { tier: "primitive" }),
		{ code: "tier-subject-mismatch", scenario: SYSTEM },
	],
	[
		"persona that does not own the job",
		() => patched(SYSTEM, { persona: "P-batch" }),
		{ code: "job-persona-mismatch", scenario: SYSTEM },
	],
	[
		"e2e proof without a proofRef",
		() => patched(SYSTEM, { proofBoundary: "story+e2e" }),
		{ code: "proof-ref-missing", scenario: SYSTEM },
	],
	[
		"proofRef that names no file",
		() =>
			patched(SYSTEM, {
				proofBoundary: "story+unit",
				proofRef: "tests/renderer/no_such_file.test.ts",
			}),
		{ code: "proof-ref-missing", scenario: SYSTEM },
	],
	[
		"proofRef outside the allowed tests",
		() =>
			patched(SYSTEM, {
				proofBoundary: "story+unit",
				proofRef: "package.json",
			}),
		{ code: "proof-ref-missing", scenario: SYSTEM },
	],
	[
		"proofRef on a story-only scenario",
		() => patched(SYSTEM, { proofRef: E2E_SPEC }),
		{ code: "proof-ref-unexpected", scenario: SYSTEM },
	],
];

describe("planted manifest defects", () => {
	test.each(DEFECTS)(
		"shown red: %s yields exactly one problem",
		(_n, mutate, expected) => {
			expect(brief(mutate())).toEqual([expected]);
		},
	);

	test("every manifest code has a planted defect", () => {
		const covered = new Set(DEFECTS.map((row) => row[2].code));
		expect([...covered].sort()).toEqual([...MANIFEST_CODES].sort());
	});

	test("shown red: planned status field", () => {
		const planned = {
			...seed(SYSTEM),
			id: "language-dropdown.planned-thing",
			status: "planned",
		};
		expect(brief(withScenarios([...real.scenarios, planned]))).toEqual([
			{ code: "unknown-field", scenario: "language-dropdown.planned-thing" },
		]);
	});
});

describe("accepted shapes", () => {
	test("a proofRef naming an existing e2e spec or unit test is accepted", () => {
		expect(
			brief(
				patched(SYSTEM, { proofBoundary: "story+e2e", proofRef: E2E_SPEC }),
			),
		).toEqual([]);
		expect(
			brief(
				patched(SYSTEM, { proofBoundary: "story+unit", proofRef: UNIT_TEST }),
			),
		).toEqual([]);
	});

	test("a unit proofRef is not accepted for an e2e boundary", () => {
		expect(
			brief(
				patched(SYSTEM, { proofBoundary: "story+e2e", proofRef: UNIT_TEST }),
			),
		).toEqual([{ code: "proof-ref-missing", scenario: SYSTEM }]);
	});
});

describe("situation boundaries", () => {
	const ascii140 = "Someone opens the language list".padEnd(140, " now");

	test("a 140-unit ASCII situation passes and a 141-unit one is missing-situation", () => {
		expect(ascii140).toHaveLength(140);
		expect(brief(patched(SYSTEM, { situation: ascii140 }))).toEqual([]);
		expect(brief(patched(SYSTEM, { situation: `${ascii140}x` }))).toEqual([
			{ code: "missing-situation", scenario: SYSTEM },
		]);
	});

	test("length is measured in UTF-16 code units, not characters", () => {
		const emoji70 = "\u{1F600}".repeat(70);
		expect(emoji70).toHaveLength(140);
		expect(brief(patched(SYSTEM, { situation: emoji70 }))).toEqual([]);
		expect(
			brief(patched(SYSTEM, { situation: "\u{1F600}".repeat(71) })),
		).toEqual([{ code: "missing-situation", scenario: SYSTEM }]);
	});

	test.each([
		["empty", ""],
		["whitespace only", "   "],
		["a newline", "Someone opens it.\nThen reads it."],
		["a carriage return", "Someone opens it.\rThen reads it."],
		["not a string", 5],
	])("%s is missing-situation", (_name, situation) => {
		expect(brief(patched(SYSTEM, { situation }))).toEqual([
			{ code: "missing-situation", scenario: SYSTEM },
		]);
	});
});

describe("manifest shape and order", () => {
	test("a manifest with no scenarios yields one story-unmapped per real story and nothing else", () => {
		const unmapped = brief(withScenarios([]));
		expect(unmapped).toEqual(
			inputs.stories
				.map((story) => ({ code: "story-unmapped", story: story.id }))
				.sort((a, b) => (a.story < b.story ? -1 : 1)),
		);
		expect(unmapped.length).toBeGreaterThanOrEqual(3);
	});

	test("problems are sorted by code, then scenario id, then story id", () => {
		const run: ManifestInputs = {
			...patched(SYSTEM, { persona: "P-nobody", job: "J-99" }),
		};
		const both = {
			...run,
			manifest: {
				schemaVersion: 1,
				scenarios: [
					{ ...seed(RTL), persona: "P-nobody" },
					...(run.manifest as ManifestDocument).scenarios,
				].filter(
					(scenario, index, all) =>
						all.findIndex((x) => x.id === scenario.id) === index,
				),
			},
		};
		expect(brief(both)).toEqual([
			{ code: "unknown-job", scenario: SYSTEM },
			{ code: "unknown-persona", scenario: RTL },
			{ code: "unknown-persona", scenario: SYSTEM },
		]);
		const unordered = {
			...inputs,
			manifest: { schemaVersion: 1, scenarios: [] },
			stories: [...inputs.stories].reverse(),
		};
		const ids = brief(unordered).map((found) => found.story ?? "");
		expect(ids).toEqual([...ids].sort());
	});
});

describe("D-23 chain: the real enumerator feeds the real checker", () => {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-chain-"));
	afterAll(() => {
		fs.rmSync(scratch, { recursive: true, force: true });
	});

	test("shown red: chain through the real enumerator", async () => {
		const component = path.join(
			repoRoot,
			"src/renderer/components/settings/LanguageDropdown",
		);
		const file = path.join(scratch, "Zz.stories.tsx");
		fs.writeFileSync(
			file,
			`import { LanguageDropdown } from ${JSON.stringify(component)};\nexport default { title: "Scratch/Zz", component: LanguageDropdown };\nexport const Zz = {};\n`,
		);
		const planted = await enumerateFile(file, "planted/Zz.stories.tsx");
		expect(planted.map((story) => story.id)).toEqual(["scratch-zz--zz"]);
		const run: ManifestInputs = {
			...inputs,
			stories: [...inputs.stories, ...planted],
		};
		expect(brief(run)).toEqual([
			{ code: "story-unmapped", story: "scratch-zz--zz" },
		]);
	});
});
