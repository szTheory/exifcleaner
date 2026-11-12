export const BRAND_QUOTE_USAGE: string;

export function headingRanges(markdown: string): Array<{
	heading: string;
	level: number;
	start: number;
	end: number;
}>;

export function checkBrandQuotes(input: {
	brandText: string;
	rulesDoc: unknown;
	catalogDoc: unknown;
	pin: string;
}): Array<{ code: string; location: string; message: string }>;

export function main(argv?: string[]): number;
