export interface ColourLiteralRow {
	file: string;
	literal: string;
	count: number;
}

export interface ColourLiteralScan {
	rows: ColourLiteralRow[];
	// #007AFF (case-insensitive) count per scanned file, tokens.css included.
	accent: Record<string, number>;
}

export interface ColourLiteralProblem {
	code: string;
	message: string;
}

export const BASELINE_PATH: string;

export const ACCENT_LITERAL: string;

export const ACCENT_SITES: Readonly<Record<string, number>>;

export function colourLiteralsInSource(subject: {
	file: string;
	text: string;
}): string[];

export function scanColourLiterals(subject: {
	root: string;
}): ColourLiteralScan;

export function ratchetProblems(subject: {
	scan: ColourLiteralScan;
	baseline: unknown;
}): ColourLiteralProblem[];

export function main(
	argv?: string[],
	options?: {
		root?: string | undefined;
		readBase?:
			| ((
					relPath: string,
					options: { ref: string; cwd: string },
			  ) => { mergeBase: string; base: unknown })
			| undefined;
	},
): number;
