export interface StoryRecord {
	id: string;
	file: string;
	title: string | null;
	component: string | null;
	tags: string[];
}

export interface ScenarioTagProblem {
	code: "scenario-tag";
	story: string;
	message: string;
}

export const STORIES_GLOB: string;

export const UNTITLED_SENTINEL: string;

export function listStoryFiles(root: string): string[];

export function enumerateFile(
	absPath: string,
	relPath: string,
): Promise<StoryRecord[]>;

export function enumerateStories(root: string): Promise<StoryRecord[]>;

export function scenarioTagProblems(
	stories: ReadonlyArray<{ id: string; tags: readonly string[] }>,
): ScenarioTagProblem[];
