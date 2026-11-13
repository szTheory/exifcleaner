import {
	composeStories,
	composeStory,
	setProjectAnnotations,
} from "@storybook/react-vite";
import { within } from "storybook/test";
import { describe, expect, test } from "vitest";
import scenarioDocument from "./catalog/scenarios.json";
import { stepProblems } from "./catalog/journey_probe.mjs";
import type { Journey, ProbeResult } from "./catalog/journey_probe.mjs";
import preview from "./preview";

// FLW-01 / D-23: the browser half of the journey dead-end check. A journey step
// names an action ({ role, name }) and the scenario it belongs to; the step is a
// dead end when no story of that scenario shows the control present, named
// exactly, enabled and keyboard reachable. The DOM is the truth, so each story
// really runs (globals theme light, locale en, so a translator PR cannot turn it
// red while an en rename still does) and the probe queries the rendered body.
//
// This file imports only journey_probe.mjs from the catalog directory (plus JSON
// data): the browser project must never load journeys.mjs, whose import chain
// reaches node:fs and typescript. The node half (schema, job set, e2e proof) is
// journeys.test.ts in storybook-node.
//
// No axe annotations here (RESEARCH Pattern 5): this gate asks one question and
// leaves accessibility to a11y_gate.test.tsx and the story projects. A story
// whose own play rejects is reported as story-run-failed, never action-missing.
//
// Runs in the `storybook-a11y-gate` browser project, sequentially. A story's DOM
// stays until the next run starts (the portable-stories runner clears the
// previous canvas and its beforeEach cleanups first), and the leak control below
// shows one story's controls never answer for the next.
setProjectAnnotations([preview]);

type CsfModule = Parameters<typeof composeStories>[0];
type Indexed = { id: string; name: string; module: CsfModule };
type Action = { role: string; name: string };
type Scenarios = ReadonlyMap<string, readonly string[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

// Every story of the given CSF modules, keyed by story id.
function indexStories(
	modules: Record<string, CsfModule>,
): Map<string, Indexed> {
	const out = new Map<string, Indexed>();
	for (const module of Object.values(modules)) {
		for (const [name, story] of Object.entries(composeStories(module))) {
			// composeStories is typed loosely for an untyped module namespace.
			// A composed story is a callable carrying its id.
			const composed: unknown = story;
			if (
				typeof composed !== "function" ||
				!("id" in composed) ||
				typeof composed.id !== "string"
			) {
				throw new Error(`story ${name} has no id`);
			}
			out.set(composed.id, { id: composed.id, name, module });
		}
	}
	return out;
}

// Must equal STORIES_GLOB (catalog/story_index.mjs); story_index.test.ts reads this
// literal back and asserts it, because import.meta.glob needs a string literal.
const realModules = import.meta.glob<CsfModule>(
	"../src/renderer/**/*.stories.@(ts|tsx)",
	{ eager: true },
);
const REAL_STORIES = indexStories(realModules);

const SCENARIOS: Scenarios = new Map(
	scenarioDocument.scenarios.map((scenario) => [scenario.id, scenario.stories]),
);

// Runs the story as a user would first see it; null when it ran, else the
// rejection message (a play that throws, or a copy-lint hit from the preview).
async function runStory(
	index: ReadonlyMap<string, Indexed>,
	storyId: string,
): Promise<string | null> {
	const hit = index.get(storyId);
	if (hit === undefined) return `no story ${storyId} in the index`;
	const exports = record(hit.module);
	const annotations = record(exports[hit.name]);
	const pinned = {
		...annotations,
		globals: {
			...record(annotations["globals"]),
			theme: "light",
			locale: "en",
		},
	};
	const story = composeStory(
		pinned,
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
}

function isDisabled(element: Element): boolean {
	return (
		element.matches(":disabled") ||
		element.getAttribute("aria-disabled") === "true"
	);
}

// The accessible name is matched exactly and case-sensitively: testing-library
// treats a string `name` as full equality after whitespace normalization, never
// as a substring (the Try againn control proves it).
function evaluate(
	action: Action,
): "ok" | "missing" | "disabled" | "unreachable" {
	const matches = within(document.body).queryAllByRole(action.role, {
		name: action.name,
	});
	if (matches.length === 0) return "missing";
	const enabled = matches.filter((element) => !isDisabled(element));
	if (enabled.length === 0) return "disabled";
	const reachable = enabled.some(
		(element) => element instanceof HTMLElement && element.tabIndex >= 0,
	);
	return reachable ? "ok" : "unreachable";
}

// The real probe. Each distinct story runs at most once: the first touch of a story
// runs it and answers every action the planted journeys ask of it, because the
// next run clears the DOM. `runs` is what the tests read back to prove it.
function makeProbe({
	index,
	journeys,
	scenarios,
}: {
	index: ReadonlyMap<string, Indexed>;
	journeys: readonly Journey[];
	scenarios: Scenarios;
}) {
	const wanted = new Map<string, Action[]>();
	for (const journey of journeys) {
		for (const step of journey.steps ?? []) {
			if (step.proof !== "story" && step.proof !== "story+e2e") continue;
			const { role, name } = step.action;
			if (role === undefined || name === undefined) continue;
			for (const storyId of scenarios.get(step.scenario) ?? []) {
				wanted.set(storyId, [...(wanted.get(storyId) ?? []), { role, name }]);
			}
		}
	}
	const answers = new Map<string, ProbeResult>();
	const runs = new Map<string, number>();
	const key = (storyId: string, action: Action): string =>
		JSON.stringify([storyId, action.role, action.name]);
	const probe = async (
		storyId: string,
		action: Action,
	): Promise<ProbeResult> => {
		const known = answers.get(key(storyId, action));
		if (known !== undefined) return known;
		runs.set(storyId, (runs.get(storyId) ?? 0) + 1);
		const failure = await runStory(index, storyId);
		for (const asked of [...(wanted.get(storyId) ?? []), action]) {
			answers.set(
				key(storyId, asked),
				failure === null
					? { status: evaluate(asked) }
					: { status: "run-failed", message: failure },
			);
		}
		return answers.get(key(storyId, action)) ?? { status: "run-failed" };
	};
	return { probe, runs };
}

function plantedJourney(name: string): Journey {
	return {
		schemaVersion: 1,
		job: "J-04",
		title: "Planted dead-end control",
		steps: [
			{
				scenario: "error-boundary.fallback",
				action: { role: "button", name },
				proof: "story",
			},
		],
	};
}

async function realProblems(journey: Journey) {
	const { probe, runs } = makeProbe({
		index: REAL_STORIES,
		journeys: [journey],
		scenarios: SCENARIOS,
	});
	return {
		problems: await stepProblems({ journey, scenarios: SCENARIOS, probe }),
		runs,
	};
}

function brief(problems: ReadonlyArray<{ code: string; step: string }>) {
	return problems.map((problem) => `${problem.code} ${problem.step}`);
}

// Each control runs a story in a real browser; the gate project sets no testTimeout,
// so the 15 s browser default applied and a loaded host could time one out before it
// asserted anything (P-5, the a11y re-check precedent).
const CONTROL_TIMEOUT_MS = 60_000;

describe("journey probe contract (pure, fake probe)", () => {
	const scenarios: Scenarios = new Map([
		["error-boundary.fallback", ["a--one"]],
	]);

	test("a step the probe resolves yields no problem", async () => {
		const problems = await stepProblems({
			journey: plantedJourney("Try again"),
			scenarios,
			probe: async () => ({ status: "ok" }),
		});
		expect(problems).toEqual([]);
	});

	test("a step the probe cannot find yields exactly one action-missing on J-04.1", async () => {
		const problems = await stepProblems({
			journey: plantedJourney("Try again"),
			scenarios,
			probe: async () => ({ status: "missing" }),
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({
			code: "action-missing",
			job: "J-04",
			step: "J-04.1",
			scenario: "error-boundary.fallback",
		});
	});
});

describe("journey dead-end gate over real stories (FLW-01, D-23)", () => {
	test(
		"Try again resolves on ui-errorboundary--fallback",
		async () => {
			const { problems, runs } = await realProblems(
				plantedJourney("Try again"),
			);
			expect(problems).toEqual([]);
			expect(Object.fromEntries(runs)).toEqual({
				"ui-errorboundary--fallback": 1,
			});
		},
		CONTROL_TIMEOUT_MS,
	);

	test(
		"the planted dead end Try againn yields exactly one action-missing (A4: no substring matching)",
		async () => {
			const { problems } = await realProblems(plantedJourney("Try againn"));
			expect(brief(problems)).toEqual(["action-missing J-04.1"]);
		},
		CONTROL_TIMEOUT_MS,
	);

	test(
		"a control shown by one story never answers for the next run (no DOM leakage)",
		async () => {
			const journey: Journey = {
				schemaVersion: 1,
				job: "J-04",
				title: "Leak control",
				steps: [
					{
						scenario: "error-boundary.fallback",
						action: { role: "button", name: "Try again" },
						proof: "story",
					},
				],
			};
			const scenarios: Scenarios = new Map([
				["error-boundary.fallback", ["ui-errorboundary--fallback"]],
				["error-boundary.healthy", ["ui-errorboundary--healthy"]],
			]);
			const { probe } = makeProbe({
				index: REAL_STORIES,
				journeys: [journey],
				scenarios,
			});
			expect(
				await probe("ui-errorboundary--fallback", {
					role: "button",
					name: "Try again",
				}),
			).toEqual({
				status: "ok",
			});
			expect(
				await probe("ui-errorboundary--healthy", {
					role: "button",
					name: "Try again",
				}),
			).toEqual({
				status: "missing",
			});
		},
		CONTROL_TIMEOUT_MS,
	);
});
