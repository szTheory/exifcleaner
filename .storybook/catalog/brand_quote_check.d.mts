export const BRAND_QUOTE_USAGE: string;

export function headingRanges(markdown: string): Array<{
	heading: string;
	level: number;
	start: number;
	end: number;
}>;

export function resolveTokenPath(
	tokensDoc: unknown,
	dottedPath: string,
): string | null;

export function specBrandSources(
	specDoc: unknown,
): Array<{ location: string; section: unknown; quote: unknown }>;

export function specTokenSources(
	specDoc: unknown,
): Array<{ location: string; path: unknown; value: unknown }>;

export function checkBrandQuotes(input: {
	brandText: string;
	rulesDoc: unknown;
	catalogDoc: unknown;
	pin: string;
	specDoc?: unknown;
	tokensDoc?: unknown;
}): Array<{ code: string; location: string; message: string }>;

export function main(argv?: string[]): number;
