import type { StoryRecord } from "./story_index.mjs";

export interface GridProblem {
	code: string;
	message: string;
	id?: string | undefined;
	cell?: string | undefined;
}

export interface Waiver {
	subject: string;
	stateClass: string;
	basis: string;
	ref: string;
	reason: string;
}

export interface GridCell {
	status: "covered" | "waived" | "gap";
	scenarios?: string[];
	waiver?: { basis: string; ref: string; reason: string };
}

export interface GridRow {
	subject: string;
	tier: string;
	cells: Record<string, GridCell>;
}

export interface GridCounts {
	subjects: number;
	states: number;
	cells: number;
	covered: number;
	waived: number;
	gaps: number;
}

export interface GridModel {
	counts: GridCounts;
	rows: GridRow[];
}

export interface WaiverContext {
	subjects: ReadonlyMap<string, string>;
	subjectFiles: ReadonlyMap<string, string>;
	coveredCells: ReadonlySet<string>;
	scenarioIds: ReadonlySet<string>;
	readText: (relPath: string) => string | null;
	fileExists: (relPath: string) => boolean;
}

export interface GridInputs {
	subjects: ReadonlyMap<string, string>;
	subjectFiles: ReadonlyMap<string, string>;
	scenarios: Array<Record<string, any>>;
	stories: StoryRecord[];
	waivers: unknown;
}

export const WAIVERS_PATH: string;
export const GRID_JSON_PATH: string;
export const GRID_MD_PATH: string;
export const GRID_CODES: readonly string[];
export const WAIVER_CODES: readonly string[];

export function cellKey(subject: string, stateClass: string): string;

export function coveredCells(inputs: {
	subjects: ReadonlyMap<string, string>;
	scenarios: ReadonlyArray<Record<string, any>>;
	stories: ReadonlyArray<{ id: string; component: string | null }>;
}): Map<string, string[]>;

export function buildGrid(inputs: {
	subjects: ReadonlyMap<string, string>;
	scenarios: ReadonlyArray<Record<string, any>>;
	stories: ReadonlyArray<{ id: string; component: string | null }>;
	waivers: readonly Waiver[];
}): GridModel;

export function renderGridJson(model: GridModel): string;

export function renderGridMarkdown(model: GridModel): string;

export function gapRatchet(documents: { base: any; head: any }): {
	problems: GridProblem[];
	notes: string[];
};

export function zeroGapProblems(
	model: GridModel,
	tiers?: readonly string[],
): GridProblem[];

export function validateWaivers(
	doc: unknown,
	ctx: WaiverContext,
): GridProblem[];

export function scanSubjectFiles(root: string): Map<string, string>;

export function loadGridInputs(root: string): Promise<GridInputs>;

export function waiverContext(root: string, inputs: GridInputs): WaiverContext;

export function loadGrid(root: string): Promise<{
	problems: GridProblem[];
	model: GridModel | null;
	stories: StoryRecord[];
}>;
