import type { Journey } from "./journey_probe.mjs";

export type {
	Journey,
	JourneyAction,
	JourneyProblem,
	JourneyProof,
	JourneyStep,
	ProbeResult,
	ProbeStatus,
} from "./journey_probe.mjs";

// A problem the schema, job-set or e2e proof check found. `step` is the derived
// step id (`J-04.3`) when the problem belongs to one step.
export interface JourneyCheckProblem {
	code: string;
	job: string;
	step?: string | undefined;
	message: string;
}

export interface JourneyFile {
	// The base name, `J-04.json`; it must equal `<job>.json`.
	file: string;
	// Parsed JSON, unvalidated: checkJourneys reports what is wrong with it.
	doc: unknown;
}

export interface JourneyInputs {
	journeys: JourneyFile[];
	// The catalog job ids: the journey set must equal them.
	jobIds: readonly string[];
	scenarioIds: ReadonlySet<string>;
	// The text of a repo-relative spec, or null when the path escapes the root or
	// names no file. It is only ever called with a path matching tests/e2e/*.spec.ts.
	readSpec: (relPath: string) => string | null;
}

export interface E2eTitles {
	// String-literal first arguments of a bare test(...) call.
	titles: string[];
	// Titles reachable only through test.skip, test.fixme or test.only.
	modified: string[];
	// The literal head of every other first argument ("" when there is none).
	dynamic: string[];
}

export const JOURNEYS_DIR: string;

export const JOURNEY_CODES: readonly string[];

export { stepId, stepProblems } from "./journey_probe.mjs";

export function checkJourneys(inputs: JourneyInputs): JourneyCheckProblem[];

export function e2eTitles(inputs: { text: string; file: string }): E2eTitles;

export function loadJourneyInputs(root: string): JourneyInputs;

export function renderJourneys(
	journeys: ReadonlyArray<{ file: string; doc: Journey }>,
): string;
