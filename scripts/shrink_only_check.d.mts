export interface ShrinkOnlyEntry {
	id: string;
	path: string;
	// The rows of a parsed document, or null when it has no rows array.
	rows(doc: unknown): unknown[] | null;
	keyOf(row: Record<string, unknown>): string;
	valueOf(row: Record<string, unknown>): number;
	approvedAdditions?: Readonly<Record<string, number>>;
}

export interface ShrinkOnlyProblem {
	code: string;
	key: string;
	message: string;
}

export const SHRINK_ONLY_REGISTRY: readonly ShrinkOnlyEntry[];

// `head` is null when the head file is absent; `base` is null when the file is absent at the
// merge-base (the one admitted bootstrap).
export function shrinkOnlyProblems(subject: {
	entry: ShrinkOnlyEntry;
	head: unknown;
	base: unknown;
}): ShrinkOnlyProblem[];

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
