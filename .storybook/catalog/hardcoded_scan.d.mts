export interface HardcodedFinding {
	path: string;
	line: number;
	literal: string;
	kind: string;
}

export interface HardcodedPair {
	path: string;
	literal: string;
	kind: string;
}

export const HARDCODED_ATTRIBUTES: readonly string[];

export function scanSource(
	fileName: string,
	sourceText: string,
): HardcodedFinding[];

export function listRendererSources(root: string): string[];

export function scanRenderer(root: string): HardcodedFinding[];

export function uniquePairs(
	findings: ReadonlyArray<{ path: string; literal: string; kind: string }>,
): HardcodedPair[];
