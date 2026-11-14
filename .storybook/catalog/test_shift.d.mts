// A problem checkTestShift found. `id` is `<spec>/<test title>` when the problem belongs to
// one test, and it orders problems of one code.
export interface TestShiftProblem {
	code: string;
	message: string;
	id?: string | undefined;
	[extra: string]: unknown;
}

export interface E2eTestAssertions {
	title: string;
	// True for test.skip, test.fixme, test.only, directly or through a describe wrapper.
	modified: boolean;
	// The normalized text of every expect, expect.soft and expect.poll chain in the
	// test callback, in source order.
	expects: string[];
}

export interface E2eAssertionWalk {
	tests: E2eTestAssertions[];
	// The literal head of every test whose title is not a string literal.
	dynamic: string[];
	// Expect chains inside beforeEach, afterEach, beforeAll and afterAll callbacks.
	hookExpects: string[];
}

// What the story rules read of a story record; a StoryRecord from story_index.mjs fits.
export interface TestShiftStory {
	id: string;
	component: string | null;
}

// A story's evidence scope: the export's own source, and that plus the same-file helpers it
// calls. A deleted item's evidence literal must appear in `scope`.
export interface StoryScope {
	exportName: string;
	own: string;
	scope: string;
}

export interface TestShiftInputs {
	// The parsed ledger, unvalidated: checkTestShift reports what is wrong with it.
	doc: unknown;
	// The text of each ledger spec, keyed by file stem.
	specTexts: Readonly<Record<string, string>>;
	// The enumerated stories and each story's evidence scope. Without them every deleted
	// item is story-missing.
	stories?: ReadonlyArray<TestShiftStory> | undefined;
	scopes?: ReadonlyMap<string, StoryScope> | undefined;
}

export const TEST_SHIFT_PATH: string;

export const TEST_SHIFT_MD_PATH: string;

export const LEDGER_SPECS: readonly string[];

export const TEST_SHIFT_CODES: readonly string[];

export function squash(text: string): string;

export function e2eAssertions(inputs: {
	text: string;
	file: string;
}): E2eAssertionWalk;

export function checkTestShift(inputs: TestShiftInputs): TestShiftProblem[];

export function storySources(absPath: string): Promise<Map<string, StoryScope>>;

export function loadStoryScopes(
	root: string,
	stories: ReadonlyArray<{ id: string; file: string }>,
	doc: unknown,
): Promise<Map<string, StoryScope>>;

export function checkTestShiftBaseline(
	root: string,
	doc: unknown,
	options?: { git?: ((args: string[], cwd: string) => string) | undefined },
): TestShiftProblem[];

export function loadTestShiftInputs(root: string): TestShiftInputs;

export function renderTestShift(doc: unknown): string;
