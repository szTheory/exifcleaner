export type JourneyProof = "story" | "story+e2e" | "e2e" | "unproven";

export interface JourneyAction {
	role?: string | undefined;
	name?: string | undefined;
	gesture?: string | undefined;
}

export interface JourneyStep {
	scenario: string;
	action: JourneyAction;
	proof: JourneyProof | string;
	e2e?: { spec: string; test: string } | undefined;
	note?: string | undefined;
}

export interface Journey {
	schemaVersion: number;
	job: string;
	title: string;
	steps?: JourneyStep[] | undefined;
	exempt?: string | undefined;
}

export type ProbeStatus =
	| "ok"
	| "missing"
	| "disabled"
	| "unreachable"
	| "run-failed";

export interface ProbeResult {
	status: ProbeStatus;
	message?: string | undefined;
}

export interface JourneyProblem {
	code: string;
	job: string;
	step: string;
	scenario: string;
	message: string;
}

export const JOURNEY_PROBE_CODES: readonly string[];

export function stepId(job: string, index: number): string;

export function stepProblems(inputs: {
	journey: { job: string; steps?: ReadonlyArray<JourneyStep> | undefined };
	scenarios: ReadonlyMap<string, readonly string[]>;
	probe: (
		storyId: string,
		action: { role: string; name: string },
	) => Promise<ProbeResult>;
}): Promise<JourneyProblem[]>;
