import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CHECK_INPUTS } from "./catalog.mjs";
import {
	JOURNEY_PROBE_CODES,
	stepProblems,
	type Journey,
	type JourneyStep,
	type ProbeStatus,
} from "./journey_probe.mjs";
import {
	JOURNEYS_DIR,
	JOURNEY_CODES,
	checkJourneys,
	e2eTitles,
	loadJourneyInputs,
	renderJourneys,
	type JourneyFile,
} from "./journeys.mjs";
import { repoRoot } from "./temp_repo";

// FLW-01 / D-22 / D-24: the journey schema, the job-set rule, the static e2e proof
// and the renderer. Every problem code has one planted mutant that yields exactly
// that code (the blast-radius assertion: toEqual of the whole code list), and a
// guard test pins the mutant codes to JOURNEY_CODES so a new code cannot land
// without a control. The browser half (the dead-end probe over real DOM) is
// .storybook/journey_gate.test.tsx; its probe codes are driven here with a fake
// probe. Nothing is planted on disk: every defect is built in memory, spec text
// included, and no tests/e2e file is read except the real ones named below.
//
// Planted spec text that needs a skipped, fixme'd or focused runner call is built
// from fragments at run time, the way no_skip.test.ts builds its controls, because
// that scan reads this file's raw text and takes no string literal on trust.
const RUN = ["te", "st"].join("");
const SKIP = ["sk", "ip"].join("");
const FIXME = ["fix", "me"].join("");
const ONLY = ["on", "ly"].join("");

type Doc = Record<string, unknown>;
type Planted = JourneyFile[];

const inputs = loadJourneyInputs(repoRoot);

const REAL_SPEC = "tests/e2e/settings.spec.ts";
const REAL_TITLE = "opens and closes the settings drawer";
const OTHER_SPEC = "tests/e2e/file-processing.spec.ts";
const OTHER_TITLE = "strips EXIF metadata from a single JPEG file";
const FALLBACK = "error-boundary.fallback";
const CHOOSE = "empty-state.copy-mode-on";
const PLANTED_SPEC = "tests/e2e/planted.spec.ts";
const PLANTED_TITLE = "opens the thing";
const EXEMPT_REASON =
	"The job is an outcome the app reports, with no control to operate.";

function isDoc(value: unknown): value is Doc {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function docOf(set: Planted, job: string): Doc {
	const hit = set.find((entry) => entry.file === `${job}.json`);
	if (hit === undefined || !isDoc(hit.doc)) {
		throw new Error(`no planted journey ${job}`);
	}
	return hit.doc;
}

function stepsOf(set: Planted, job: string): Doc[] {
	const steps = docOf(set, job)["steps"];
	if (!Array.isArray(steps)) throw new Error(`${job} has no steps`);
	return steps.filter(isDoc);
}

function firstStep(set: Planted, job: string): Doc {
	const step = stepsOf(set, job)[0];
	if (step === undefined) throw new Error(`${job} has no first step`);
	return step;
}

function replaceDoc(set: Planted, job: string, doc: unknown): void {
	const index = set.findIndex((entry) => entry.file === `${job}.json`);
	if (index < 0) throw new Error(`no planted journey ${job}`);
	set.splice(index, 1, { file: `${job}.json`, doc });
}

function story(scenario: string, name: string, proof = "story"): Doc {
	return { scenario, action: { role: "button", name }, proof };
}

// A valid journey set, fresh on every call so a mutant never leaks into the next
// test: one file per catalog job, J-01 and J-08 exempt, a probed story step, a
// story+e2e step on a real spec and title, a gesture step proven by e2e, an
// unproven step with a note, and two consecutive identical steps (adjacency).
function planted(): Planted {
	return inputs.jobIds.map((job) => {
		const doc: Doc = {
			schemaVersion: 1,
			job,
			title: `Planted journey ${job}`,
		};
		if (job === "J-01" || job === "J-08") {
			doc["exempt"] = EXEMPT_REASON + EXEMPT_REASON;
		} else if (job === "J-03") {
			doc["steps"] = [
				{
					...story(FALLBACK, "Try again", "story+e2e"),
					e2e: { spec: REAL_SPEC, test: REAL_TITLE },
				},
			];
		} else if (job === "J-04") {
			doc["steps"] = [
				{
					scenario: CHOOSE,
					action: { gesture: "Drop files on the window" },
					proof: "e2e",
					e2e: { spec: OTHER_SPEC, test: OTHER_TITLE },
					note: "The e2e test sends the file-open IPC; a real drop is never made.",
				},
			];
		} else if (job === "J-05") {
			doc["steps"] = [
				{
					...story(FALLBACK, "Copy error", "unproven"),
					note: "The copy target is a pre with a click handler, not a control.",
				},
			];
		} else if (job === "J-06") {
			doc["steps"] = [
				story(CHOOSE, "Clear"),
				story(CHOOSE, "Clear"),
				story(CHOOSE, "Choose folder…"),
			];
		} else {
			doc["steps"] = [story(FALLBACK, "Try again")];
		}
		return { file: `${job}.json`, doc };
	});
}

function check(
	set: Planted,
	readSpec: (relPath: string) => string | null = inputs.readSpec,
) {
	return checkJourneys({ ...inputs, journeys: set, readSpec });
}

function codes(set: Planted, readSpec?: (relPath: string) => string | null) {
	return check(set, readSpec).map((problem) => problem.code);
}

// A spec with the planted title inside a describe callback (P-6), plus a title of
// no interest, built from fragments where a modifier is involved.
function specWith(lines: string[]): string {
	return [`${RUN}.describe("Planted", () => {`, ...lines, "});", ""].join("\n");
}

function call(title: string, modifier?: string): string {
	const callee = modifier === undefined ? RUN : `${RUN}.${modifier}`;
	return `\t${callee}(${JSON.stringify(title)}, async () => {});`;
}

function plantedSpecReader(text: string) {
	return (relPath: string): string | null =>
		relPath === PLANTED_SPEC ? text : inputs.readSpec(relPath);
}

function aimAtPlantedSpec(set: Planted): void {
	firstStep(set, "J-03")["e2e"] = { spec: PLANTED_SPEC, test: PLANTED_TITLE };
}

type Mutant = {
	code: string;
	name: string;
	apply: (set: Planted) => void;
	readSpec?: (relPath: string) => string | null;
};

// One planted defect per node-side code; each yields exactly its own code.
const NODE_MUTANTS: readonly Mutant[] = [
	{
		code: "not-object",
		name: "a journey that is an array",
		apply: (set) => replaceDoc(set, "J-02", []),
	},
	{
		code: "schema-version",
		name: "schemaVersion 2",
		apply: (set) => {
			docOf(set, "J-02")["schemaVersion"] = 2;
		},
	},
	{
		code: "unknown-field",
		name: "an extra top-level key",
		apply: (set) => {
			docOf(set, "J-02")["extra"] = true;
		},
	},
	{
		code: "bad-job",
		name: "a job that is not J-NN",
		apply: (set) => {
			docOf(set, "J-02")["job"] = "j2";
		},
	},
	{
		code: "job-file-mismatch",
		name: "J-02.json holding job J-03",
		apply: (set) => {
			docOf(set, "J-02")["job"] = "J-03";
		},
	},
	{
		code: "bad-title",
		name: "an empty title",
		apply: (set) => {
			docOf(set, "J-02")["title"] = "";
		},
	},
	{
		code: "exempt-shape",
		name: "an exempt reason under 40 characters",
		apply: (set) => {
			docOf(set, "J-01")["exempt"] = "too short";
		},
	},
	{
		code: "no-steps",
		name: "an empty steps array",
		apply: (set) => {
			docOf(set, "J-02")["steps"] = [];
		},
	},
	{
		code: "step-shape",
		name: "a step without a proof",
		apply: (set) => {
			delete firstStep(set, "J-02")["proof"];
		},
	},
	{
		code: "bad-action",
		name: "an action with a role and no name",
		apply: (set) => {
			firstStep(set, "J-02")["action"] = { role: "button" };
		},
	},
	{
		code: "bad-proof",
		name: "a proof outside the four values",
		apply: (set) => {
			firstStep(set, "J-02")["proof"] = "maybe";
		},
	},
	{
		code: "unknown-scenario",
		name: "a scenario that is not in the manifest",
		apply: (set) => {
			firstStep(set, "J-02")["scenario"] = "no-such.scenario";
		},
	},
	{
		code: "note-required",
		name: "an unproven step without a note",
		apply: (set) => {
			delete firstStep(set, "J-05")["note"];
		},
	},
	{
		code: "e2e-required",
		name: "proof e2e without an e2e reference",
		apply: (set) => {
			delete firstStep(set, "J-04")["e2e"];
		},
	},
	{
		code: "e2e-unexpected",
		name: "proof story carrying an e2e reference",
		apply: (set) => {
			firstStep(set, "J-02")["e2e"] = { spec: REAL_SPEC, test: REAL_TITLE };
		},
	},
	{
		code: "gesture-story",
		name: "a gesture step claiming story proof",
		apply: (set) => {
			const step = firstStep(set, "J-04");
			step["proof"] = "story";
			delete step["e2e"];
		},
	},
	{
		code: "job-missing",
		name: "no file for J-09",
		apply: (set) => {
			set.splice(
				set.findIndex((entry) => entry.file === "J-09.json"),
				1,
			);
		},
	},
	{
		code: "unknown-job",
		name: "a file for a job the catalog does not have",
		apply: (set) => {
			set.push({
				file: "J-10.json",
				doc: {
					schemaVersion: 1,
					job: "J-10",
					title: "Planted extra job",
					exempt: EXEMPT_REASON + EXEMPT_REASON,
				},
			});
		},
	},
	{
		code: "e2e-path",
		name: "an e2e spec that climbs out of tests/e2e",
		apply: (set) => {
			firstStep(set, "J-03")["e2e"] = {
				spec: "tests/e2e/../../package.json",
				test: REAL_TITLE,
			};
		},
	},
	{
		code: "e2e-title-missing",
		name: "a title that is not in the planted spec",
		apply: aimAtPlantedSpec,
		readSpec: plantedSpecReader(specWith([call("some other title")])),
	},
	{
		code: "e2e-title-modified",
		name: "a title only reachable through a skipped call",
		apply: aimAtPlantedSpec,
		readSpec: plantedSpecReader(specWith([call(PLANTED_TITLE, SKIP)])),
	},
	{
		code: "e2e-title-dynamic",
		name: "a title only generated by a template literal",
		apply: aimAtPlantedSpec,
		readSpec: plantedSpecReader(
			specWith([
				`\t${RUN}(\`${PLANTED_TITLE.slice(0, -5)}\${name}\`, async () => {});`,
			]),
		),
	},
	{
		code: "e2e-title-duplicate",
		name: "a title declared twice",
		apply: aimAtPlantedSpec,
		readSpec: plantedSpecReader(
			specWith([call(PLANTED_TITLE), call(PLANTED_TITLE)]),
		),
	},
];

// Probe-side codes, each through stepProblems with a fake probe.
const PROBE_MUTANTS: ReadonlyArray<{
	code: string;
	status: ProbeStatus | "no-scenario";
}> = [
	{ code: "action-disabled", status: "disabled" },
	{ code: "action-missing", status: "missing" },
	{ code: "action-unreachable", status: "unreachable" },
	{ code: "story-run-failed", status: "run-failed" },
	{ code: "unknown-scenario", status: "no-scenario" },
];

function probeJourney(set: Planted, job = "J-02") {
	return {
		job,
		steps: stepsOf(set, job) as unknown as JourneyStep[],
	};
}

const SCENARIO_MAP = new Map([
	[FALLBACK, ["a--one", "a--two"]],
	[CHOOSE, ["b--one"]],
]);

describe("the planted baseline", () => {
	test("anti-vacuity: the real catalog has nine jobs and the planted ids are real", () => {
		expect(inputs.jobIds).toHaveLength(9);
		expect(inputs.scenarioIds.has(FALLBACK)).toBe(true);
		expect(inputs.scenarioIds.has(CHOOSE)).toBe(true);
		expect(planted()).toHaveLength(9);
	});

	test("a valid planted set (one file per job, J-01 and J-08 exempt, every proof kind) is clean", () => {
		expect(check(planted())).toEqual([]);
	});

	test("the planted spec and title are really declared in the real spec files", () => {
		const real = inputs.readSpec(REAL_SPEC) ?? "";
		const other = inputs.readSpec(OTHER_SPEC) ?? "";
		expect(real.length).toBeGreaterThan(0);
		expect(other.length).toBeGreaterThan(0);
		expect(real).toContain(REAL_TITLE);
		expect(other).toContain(OTHER_TITLE);
	});
});

describe("one planted defect, one code (D-24)", () => {
	test.each(NODE_MUTANTS.map((mutant) => [mutant.code, mutant] as const))(
		"%s",
		(code, mutant) => {
			const set = planted();
			mutant.apply(set);
			expect(codes(set, mutant.readSpec)).toEqual([code]);
		},
	);

	test.each(PROBE_MUTANTS.map((mutant) => [mutant.code, mutant] as const))(
		"probe code %s through stepProblems with a fake probe",
		async (code, mutant) => {
			const calls: string[] = [];
			const problems = await stepProblems({
				journey: probeJourney(planted()),
				scenarios: mutant.status === "no-scenario" ? new Map() : SCENARIO_MAP,
				probe: async (storyId) => {
					calls.push(storyId);
					return mutant.status === "no-scenario"
						? { status: "ok" }
						: { status: mutant.status };
				},
			});
			expect(problems.map((problem) => problem.code)).toEqual([code]);
			expect(problems[0]).toMatchObject({ job: "J-02", step: "J-02.1" });
			if (code === "unknown-scenario") expect(calls).toEqual([]);
		},
	);

	test("a probe that throws is a failed run, never a missing control", async () => {
		const problems = await stepProblems({
			journey: probeJourney(planted()),
			scenarios: SCENARIO_MAP,
			probe: async () => {
				throw new Error("boom");
			},
		});
		expect(problems.map((problem) => problem.code)).toEqual([
			"story-run-failed",
		]);
		expect(problems[0]?.message).toContain("boom");
	});

	test("the mutant codes equal JOURNEY_CODES: no code without a control, none outside the list", () => {
		const node = NODE_MUTANTS.map((mutant) => mutant.code);
		const probe = PROBE_MUTANTS.map((mutant) => mutant.code);
		expect(new Set(node).size).toBe(node.length);
		expect(new Set(probe).size).toBe(probe.length);
		expect([...probe].sort()).toEqual([...JOURNEY_PROBE_CODES]);
		expect([...new Set([...node, ...probe])].sort()).toEqual([
			...JOURNEY_CODES,
		]);
		// unknown-scenario is the one code both halves report; every other probe code is
		// reported only by the probe, so the node table is the rest.
		const probeOnly = JOURNEY_PROBE_CODES.filter(
			(code) => code !== "unknown-scenario",
		);
		expect([...node].sort()).toEqual(
			JOURNEY_CODES.filter((code) => !probeOnly.includes(code)),
		);
		expect(JOURNEY_CODES).toHaveLength(27);
	});
});

describe("probe resolution over several stories", () => {
	test("a step passes when any story of its scenario resolves it", async () => {
		const problems = await stepProblems({
			journey: probeJourney(planted()),
			scenarios: SCENARIO_MAP,
			probe: async (storyId) =>
				storyId === "a--two" ? { status: "ok" } : { status: "missing" },
		});
		expect(problems).toEqual([]);
	});

	test("the nearest failure wins: a story that did not run says the least", async () => {
		const statuses: Record<string, ProbeStatus> = {
			"a--one": "run-failed",
			"a--two": "disabled",
		};
		const problems = await stepProblems({
			journey: probeJourney(planted()),
			scenarios: SCENARIO_MAP,
			probe: async (storyId) => ({ status: statuses[storyId] ?? "missing" }),
		});
		expect(problems.map((problem) => problem.code)).toEqual([
			"action-disabled",
		]);
	});

	test("only story and story+e2e steps with a role and name are probed", async () => {
		const set = planted();
		const asked: string[] = [];
		const all = [
			...stepsOf(set, "J-03"),
			...stepsOf(set, "J-04"),
			...stepsOf(set, "J-05"),
		] as unknown as JourneyStep[];
		const problems = await stepProblems({
			journey: { job: "J-03", steps: all },
			scenarios: SCENARIO_MAP,
			probe: async (storyId, action) => {
				asked.push(`${storyId} ${action.role} ${action.name}`);
				return { status: "ok" };
			},
		});
		expect(problems).toEqual([]);
		// Only J-03's story+e2e step: the gesture e2e step and the unproven step are not.
		expect(asked).toEqual(["a--one button Try again"]);
	});

	test("adjacency: two consecutive identical steps are both kept, with distinct derived ids", async () => {
		const set = planted();
		expect(stepsOf(set, "J-06").slice(0, 2)).toEqual([
			story(CHOOSE, "Clear"),
			story(CHOOSE, "Clear"),
		]);
		expect(check(set)).toEqual([]);
		const problems = await stepProblems({
			journey: probeJourney(set, "J-06"),
			scenarios: SCENARIO_MAP,
			probe: async () => ({ status: "missing" }),
		});
		expect(problems.map((problem) => problem.step)).toEqual([
			"J-06.1",
			"J-06.2",
			"J-06.3",
		]);
	});

	test("problems are sorted by code, then job, then step (code-unit order)", async () => {
		const set = planted();
		const problems = await stepProblems({
			journey: probeJourney(set, "J-06"),
			scenarios: SCENARIO_MAP,
			probe: async (_storyId, action) => ({
				status: action.name === "Clear" ? "missing" : "disabled",
			}),
		});
		expect(
			problems.map((problem) => `${problem.code} ${problem.step}`),
		).toEqual([
			"action-disabled J-06.3",
			"action-missing J-06.1",
			"action-missing J-06.2",
		]);
	});
});

describe("schema edges", () => {
	test("a journey with neither steps nor exempt is no-steps", () => {
		const set = planted();
		delete docOf(set, "J-02")["steps"];
		expect(codes(set)).toEqual(["no-steps"]);
	});

	test("an exempt journey carrying steps is exempt-shape", () => {
		const set = planted();
		docOf(set, "J-01")["steps"] = [story(FALLBACK, "Try again")];
		expect(codes(set)).toEqual(["exempt-shape"]);
	});

	test("problems are sorted by code, then job, then step", () => {
		const set = planted();
		delete firstStep(set, "J-05")["note"];
		delete firstStep(set, "J-04")["e2e"];
		firstStep(set, "J-02")["scenario"] = "no-such.scenario";
		expect(
			check(set).map((problem) => `${problem.code} ${problem.step}`),
		).toEqual([
			"e2e-required J-04.1",
			"note-required J-05.1",
			"unknown-scenario J-02.1",
		]);
	});

	test("a journey file that fails its structure reports only structure (one planted defect, one code)", () => {
		const set = planted();
		const step = firstStep(set, "J-02");
		step["proof"] = "maybe";
		step["scenario"] = "no-such.scenario";
		expect(codes(set)).toEqual(["bad-proof"]);
	});

	test("a gesture step proven by e2e is clean and a gesture step claiming story+e2e is gesture-story", () => {
		expect(check(planted())).toEqual([]);
		const set = planted();
		firstStep(set, "J-04")["proof"] = "story+e2e";
		expect(codes(set)).toEqual(["gesture-story"]);
	});
});

describe("static e2e proof (D-24, T-73-09, T-73-10)", () => {
	const live = specWith([call(PLANTED_TITLE), call("another title")]);

	function run(text: string) {
		const set = planted();
		aimAtPlantedSpec(set);
		return codes(set, plantedSpecReader(text));
	}

	test("a title declared once inside a describe callback is live (P-6)", () => {
		expect(run(live)).toEqual([]);
	});

	test("a template literal with no substitution is a static title", () => {
		const text = specWith([`\t${RUN}(\`${PLANTED_TITLE}\`, async () => {});`]);
		expect(run(text)).toEqual([]);
	});

	test.each([
		["skip", SKIP],
		["fixme", FIXME],
		["only", ONLY],
	])(
		"a title only on the %s member of the runner is e2e-title-modified",
		(_name, member) => {
			expect(run(specWith([call(PLANTED_TITLE, member)]))).toEqual([
				"e2e-title-modified",
			]);
		},
	);

	test.each([
		["skipped", SKIP],
		["focused", ONLY],
	])(
		"a title inside a %s describe wrapper is e2e-title-modified",
		(_name, member) => {
			const text = [
				`${RUN}.describe.${member}("Planted", () => {`,
				call(PLANTED_TITLE),
				"});",
				"",
			].join("\n");
			expect(run(text)).toEqual(["e2e-title-modified"]);
		},
	);

	test("a live declaration wins over a skipped duplicate of the same title", () => {
		expect(
			run(specWith([call(PLANTED_TITLE), call(PLANTED_TITLE, SKIP)])),
		).toEqual([]);
	});

	test("a conditional skip inside a test body does not blame the title", () => {
		const text = specWith([
			call(PLANTED_TITLE),
			`\t${RUN}.${SKIP}(process.env["CI"] === "1", "no display");`,
		]);
		expect(run(text)).toEqual([]);
	});

	test("a title that starts with a dynamic title's literal head is e2e-title-dynamic, any other is missing", () => {
		const text = specWith([
			`\t${RUN}(\`filters out unsupported \${fixture}\`, async () => {});`,
		]);
		const set = planted();
		firstStep(set, "J-03")["e2e"] = {
			spec: PLANTED_SPEC,
			test: "filters out unsupported heic",
		};
		expect(codes(set, plantedSpecReader(text))).toEqual(["e2e-title-dynamic"]);
		firstStep(set, "J-03")["e2e"] = {
			spec: PLANTED_SPEC,
			test: "something else entirely",
		};
		expect(codes(set, plantedSpecReader(text))).toEqual(["e2e-title-missing"]);
	});

	test("the real settings spec yields its static title inside test.describe (P-6)", () => {
		const parsed = e2eTitles({
			text: inputs.readSpec(REAL_SPEC) ?? "",
			file: REAL_SPEC,
		});
		expect(parsed.titles.filter((title) => title === REAL_TITLE)).toEqual([
			REAL_TITLE,
		]);
		expect(parsed.modified).toEqual([]);
	});

	test("the real error-handling spec yields static titles and a dynamic prefix", () => {
		const parsed = e2eTitles({
			text: inputs.readSpec("tests/e2e/error-handling.spec.ts") ?? "",
			file: "tests/e2e/error-handling.spec.ts",
		});
		expect(parsed.titles).toContain(
			"handles a corrupted file without crashing",
		);
		expect(parsed.dynamic).toContain("filters out unsupported file format ");
	});

	test.each([
		["an absolute path", "/etc/passwd"],
		["a parent segment", "tests/e2e/../../package.json"],
		["a backslash", "tests\\e2e\\settings.spec.ts"],
		["a drive colon", "C:/tests/e2e/settings.spec.ts"],
		["a nested directory", "tests/e2e/helpers/launch.spec.ts"],
		["the wrong extension", "tests/e2e/settings.ts"],
		["a NUL byte", "tests/e2e/settings.spec.ts\0"],
	])("%s is e2e-path and is never read", (_name, spec) => {
		const set = planted();
		firstStep(set, "J-03")["e2e"] = { spec, test: REAL_TITLE };
		const reads: string[] = [];
		const problems = codes(set, (relPath) => {
			reads.push(relPath);
			return inputs.readSpec(relPath);
		});
		expect(problems).toEqual(["e2e-path"]);
		// J-04's own real spec is read; the mutated path never is.
		expect(reads).not.toContain(spec);
	});

	test.each([
		["a wildcard", "tests/e2e/*.spec.ts"],
		["a colon in the name", "tests/e2e/a:b.spec.ts"],
		["a brace", "tests/e2e/{a,b}.spec.ts"],
		["a question mark", "tests/e2e/a?.spec.ts"],
	])(
		"%s matches the path pattern but the reader refuses it: e2e-path, nothing read",
		(_name, spec) => {
			const set = planted();
			firstStep(set, "J-03")["e2e"] = { spec, test: REAL_TITLE };
			expect(inputs.readSpec(spec)).toBeNull();
			expect(codes(set)).toEqual(["e2e-path"]);
		},
	);

	test("a spec path that matches but names no file is e2e-path", () => {
		const set = planted();
		firstStep(set, "J-03")["e2e"] = {
			spec: "tests/e2e/does-not-exist.spec.ts",
			test: REAL_TITLE,
		};
		expect(codes(set)).toEqual(["e2e-path"]);
	});

	test("the real reader confines every path to the repo root (T-71-14)", () => {
		expect(inputs.readSpec("../package.json")).toBeNull();
		expect(inputs.readSpec("/etc/passwd")).toBeNull();
		expect(inputs.readSpec("tests/e2e/../../package.json")).toBeNull();
		expect(inputs.readSpec("tests/e2e/settings.spec.ts")).toContain(REAL_TITLE);
	});
});

describe("loadJourneyInputs", () => {
	let tmp = "";
	// Only the CHECK_INPUTS the loader needs. The catalog directory is a real copy (the
	// tests add a journeys directory to it); every other input is a symlink the loader
	// only reads, so the real repository is never written.
	beforeAll(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "journeys-load-"));
		for (const entry of CHECK_INPUTS) {
			const from = path.join(repoRoot, entry);
			const to = path.join(tmp, entry);
			fs.mkdirSync(path.dirname(to), { recursive: true });
			if (entry === ".storybook/catalog") {
				fs.cpSync(from, to, { recursive: true });
			} else {
				fs.symlinkSync(from, to);
			}
		}
		fs.rmSync(path.join(tmp, JOURNEYS_DIR), { recursive: true, force: true });
	});
	afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

	test("an absent journeys directory is an empty set, with the real job and scenario ids", () => {
		const loaded = loadJourneyInputs(tmp);
		expect(loaded.journeys).toEqual([]);
		expect(loaded.jobIds).toEqual(inputs.jobIds);
		expect(loaded.scenarioIds.has(FALLBACK)).toBe(true);
	});

	test("journey files are read in file-name order and non-JSON files are ignored", () => {
		const dir = path.join(tmp, JOURNEYS_DIR);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "J-02.json"), '{"job":"J-02"}\n');
		fs.writeFileSync(path.join(dir, "J-01.json"), '{"job":"J-01"}\n');
		fs.writeFileSync(path.join(dir, "notes.txt"), "not a journey\n");
		expect(loadJourneyInputs(tmp).journeys).toEqual([
			{ file: "J-01.json", doc: { job: "J-01" } },
			{ file: "J-02.json", doc: { job: "J-02" } },
		]);
	});
});

describe("renderJourneys", () => {
	const set = planted();
	const docs = set.map((entry) => ({
		file: entry.file,
		doc: entry.doc as Journey,
	}));

	test("the output is byte-stable, order independent, has no carriage return and one trailing newline", () => {
		const text = renderJourneys(docs);
		expect(renderJourneys(docs)).toBe(text);
		expect(renderJourneys([...docs].reverse())).toBe(text);
		expect(text).not.toContain("\r");
		expect(text.endsWith("\n")).toBe(true);
		expect(text.endsWith("\n\n")).toBe(false);
		expect(text.startsWith("<!-- Generated from")).toBe(true);
	});

	test("steps render in file order with derived ids, proof and e2e reference; exempt jobs show their reason", () => {
		const text = renderJourneys(docs);
		const rows = text.split("\n").filter((line) => line.startsWith("| J-06."));
		expect(rows.map((row) => row.split(" | ")[0])).toEqual([
			"| J-06.1",
			"| J-06.2",
			"| J-06.3",
		]);
		expect(rows[2]).toContain("Choose folder…");
		expect(text).toContain(`${REAL_SPEC} › ${REAL_TITLE}`);
		expect(text).toContain("| story+e2e |");
		expect(text).toContain("gesture: Drop files on the window");
		expect(text).toContain(`Exempt: ${EXEMPT_REASON}`);
		const jobs = [...text.matchAll(/^## (J-\d\d):/gm)].map((match) => match[1]);
		expect(jobs).toEqual([...inputs.jobIds].sort());
	});

	test("a pipe in a cell is escaped so a row keeps its columns", () => {
		const copy = planted();
		firstStep(copy, "J-02")["action"] = { role: "button", name: "a|b" };
		const text = renderJourneys(
			copy.map((entry) => ({ file: entry.file, doc: entry.doc as Journey })),
		);
		expect(text).toContain('button "a\\|b"');
	});
});
