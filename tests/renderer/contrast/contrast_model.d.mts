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

export interface ContrastPairsDocument {
	schemaVersion?: number;
	brandPin?: string;
	surfaces: string[];
	overlays: ContrastOverlay[];
	localTokens: Record<string, { light: string; dark: string }>;
	pairs: ContrastPair[];
	literals?: unknown[];
	exempt?: unknown[];
	proposed?: unknown[];
	brandRatios?: unknown[];
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

export function contrastGapEntry(
	result: ContrastResult,
): ContrastGapEntry;
