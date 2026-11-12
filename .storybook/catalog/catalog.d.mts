export const CHECK_INPUTS: readonly string[];

export function parseArguments(argv: string[]): {
	flags: Set<string>;
	base: string | undefined;
};

export function generatedFiles(root: string): Array<[string, string]>;

export function checkCatalog(options: {
	root: string;
	base?: string | undefined;
}): {
	ok: boolean;
	problems: Array<{ code: string; message: string }>;
	files: number;
	notes: string[];
};

export function writeCatalog(root: string): number;

export function main(argv?: string[]): number;
