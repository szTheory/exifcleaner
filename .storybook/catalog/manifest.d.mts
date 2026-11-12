import type { CopyRuleset } from "./copy_lint.mjs";
import type { StoryRecord } from "./story_index.mjs";

export interface ManifestProblem {
	code: string;
	scenario?: string | undefined;
	story?: string | undefined;
	message: string;
}

export interface ManifestScenario {
	id: string;
	persona: string;
	job: string;
	stateClass: string;
	tier: string;
	situation: string;
	proofBoundary: string;
	stories: string[];
	proofRef?: string | undefined;
}

export interface ManifestDocument {
	schemaVersion: number;
	scenarios: ManifestScenario[];
}

export interface ManifestInputs {
	manifest: unknown;
	stories: ReadonlyArray<
		Pick<StoryRecord, "id" | "title" | "component"> &
			Partial<Omit<StoryRecord, "id" | "title" | "component">>
	>;
	personas: readonly string[];
	jobPersonas: Readonly<Record<string, readonly string[]>>;
	subjects: ReadonlyMap<string, string>;
	fileExists: (relPath: string) => boolean;
	ruleset: CopyRuleset;
}

export const SCENARIOS_PATH: string;

export const MANIFEST_CODES: readonly string[];

export function checkManifest(inputs: ManifestInputs): ManifestProblem[];

export function loadManifestInputs(root: string): Promise<ManifestInputs>;
