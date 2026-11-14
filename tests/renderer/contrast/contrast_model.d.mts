import type { Rgba } from "./wcag.mjs";

export type ContrastTheme = "light" | "dark";

export type ContrastRole = "text" | "non-text" | "focus";

export interface ContrastPair {
	id: string;
	fg: string;
	on: string | string[];
	role: ContrastRole;
	selector: string;
	story: string;
}

export interface ContrastOverlay {
	id: string;
	layers: string[];
}

export interface ContrastLiteral {
	value: string;
	files: string[];
	pair?: string;
	exempt?: string;
}

export interface ContrastExempt {
	name: string;
	reason: string;
	fill?: string;
}

export interface ContrastColour {
	ref: string;
	hex: string;
}

export interface ContrastProposed {
	id: string;
	role: ContrastRole;
	fg: ContrastColour;
	bg: ContrastColour;
}

export interface ContrastBrandRatio {
	fg: ContrastColour;
	bg: ContrastColour;
	ratio: string;
}

export interface ContrastPairsDocument {
	schemaVersion?: number;
	brandPin?: string;
	surfaces: string[];
	overlays: ContrastOverlay[];
	localTokens: Record<string, { light: string; dark: string }>;
	pairs: ContrastPair[];
	literals?: ContrastLiteral[];
	exempt?: ContrastExempt[];
	proposed?: ContrastProposed[];
	brandRatios?: ContrastBrandRatio[];
}

export interface ContrastResult {
	pair: string;
	backdrop: string;
	theme: ContrastTheme;
	role: ContrastRole;
	story: string;
	selector: string;
	fgRef: string;
	bgRef: string;
	fgHex: string;
	bgHex: string;
	ratio: number;
	threshold: number;
	pass: boolean;
	rule: string;
	fingerprint: string;
}

export interface ContrastGapEntry {
	fingerprint: string;
	kind: "contrast-gap";
	story: string;
	rule: string;
	reason: string;
	disposition: "fix-v5.1";
	severity: "major";
}

export interface ContrastProblem {
	code: string;
	message: string;
	file?: string;
	line?: number;
}

export interface TokenMapLike {
	entries?: Array<{ name: string; disposition: string; finding?: string }>;
}

export interface ThemeTokenMaps {
	light: Map<string, string>;
	dark: Map<string, string>;
}

export const THEMES: readonly ContrastTheme[];

export const THRESHOLDS: Readonly<Record<ContrastRole, number>>;

export function compareCodeUnits(first: string, second: string): number;

export function themeTokens(tokensCss: string): ThemeTokenMaps;

export function resolveColour(
	ref: string,
	theme: ContrastTheme,
	tokens: ThemeTokenMaps,
	doc: { localTokens?: Record<string, { light: string; dark: string }> },
): Rgba | null;

export function backdropShortName(
	ref: string,
	doc: { overlays?: ContrastOverlay[] },
): string;

export function backdrops(
	pair: { on: string | string[] },
	doc: { surfaces: string[]; overlays?: ContrastOverlay[] },
): Array<{ ref: string; short: string }>;

export function evaluate(
	doc: ContrastPairsDocument,
	tokensCss: string,
): ContrastResult[];

export function failingFingerprints(
	results: Array<{ pass: boolean; fingerprint: string }>,
): Set<string>;

export function compareBaseline(
	failing: Iterable<string>,
	entries: Array<{ kind: string; fingerprint: string }>,
): { newFailures: string[]; fixedStillListed: string[] };

export function reasonFor(result: {
	selector: string;
	fgRef: string;
	bgRef: string;
	fgHex: string;
	bgHex: string;
	ratio: number;
	theme: string;
	role: string;
	threshold: number;
}): string;

export function contrastGapEntry(result: ContrastResult): ContrastGapEntry;

export function normaliseLiteral(text: string): string;

export function colourLiterals(
	value: string,
): Array<{ text: string; normalised: string }>;

export function varReferences(
	value: string,
): Array<{ name: string; fallback: string | undefined }>;

export function pairsShapeProblems(doc: unknown): ContrastProblem[];

export function g1Problems(
	tokensCss: string,
	doc: ContrastPairsDocument,
): ContrastProblem[];

export function g2Report(
	stylesheets: Record<string, string>,
	doc: ContrastPairsDocument,
	tokensCss: string,
	tokenMap: TokenMapLike | undefined,
): { problems: ContrastProblem[]; classified: number; background: number };

export function g2Problems(
	stylesheets: Record<string, string>,
	doc: ContrastPairsDocument,
	tokensCss: string,
	tokenMap: TokenMapLike | undefined,
): ContrastProblem[];

export function proposedResults(doc: ContrastPairsDocument): Array<{
	id: string;
	role: string;
	fgHex: string;
	bgHex: string;
	ratio: number;
	threshold: number;
	pass: boolean;
}>;

export function uiSpecIndex(uiSpec: unknown): {
	byId: Map<string, string>;
	byPath: Map<string, string>;
};

export function proposedConsistencyProblems(
	doc: ContrastPairsDocument,
	sources: { uiSpec: unknown; tokenMap: unknown; pin: string },
): ContrastProblem[];

export function brandRatioProblems(doc: ContrastPairsDocument): ContrastProblem[];
