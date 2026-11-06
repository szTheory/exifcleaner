import type { BrandPin, FetchBytes } from "./brand_lib.mjs";
export function runBrandUpdate(args: {
	argv: string[];
	env?: Record<string, string | undefined>;
	root: string;
	fetchBytes?: FetchBytes;
	log?: (line: string) => void;
}): Promise<BrandPin>;
