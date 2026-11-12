export function resolveBaseRef(
	explicit: string | undefined,
	env: Record<string, string | undefined>,
): string;

export function readMergeBase(
	relPath: string,
	options: { ref: string; cwd: string },
): { mergeBase: string; base: unknown };
