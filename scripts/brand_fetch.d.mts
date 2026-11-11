export function runBrandFetch(args: {
	env?: Record<string, string | undefined>;
	root: string;
	log?: (line: string) => void;
}): Promise<{ skipped: boolean; shipped?: string[] }>;
