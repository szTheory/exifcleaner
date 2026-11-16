import type { BrandPin } from "./brand_lib.mjs";

export interface VendoredProblem {
	// One of: cache, manifest-shape, pin-mismatch, duplicate-target, source-unresolvable,
	// source-missing, source-hash, target-outside, vendored-missing, vendored-hash,
	// unlisted-vendored.
	code: string;
	message: string;
}

export const MANIFEST_FILE_NAME: string;
export const VENDORED_DIR: string;

// `manifest` is the parsed brand.vendored.json, untrusted: a malformed one is a
// `manifest-shape` problem, never a throw. Resolves to no problem only when the offline cache
// equals the pin and every row and vendored file agrees.
export function vendoredProblems(args: {
	root: string;
	pin: BrandPin;
	manifest: unknown;
	cacheDir: string;
	vendoredDir: string;
}): Promise<VendoredProblem[]>;

// The strict CLI body: 0 on a pass, 1 on any problem, an unreadable input or an absent cache.
export function main(options?: {
	root?: string;
	log?: (line: string) => void;
	error?: (line: string) => void;
}): Promise<number>;
