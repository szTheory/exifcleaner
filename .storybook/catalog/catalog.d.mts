export const CHECK_INPUTS: readonly string[];

export function parseArguments(argv: string[]): {
	flags: Set<string>;
	base: string | undefined;
};

export function generatedFiles(root: string): Promise<Array<[string, string]>>;

export function checkCatalog(options: {
	root: string;
	base?: string | undefined;
}): Promise<{
	ok: boolean;
	problems: Array<{ code: string; message: string }>;
	files: number;
	notes: string[];
}>;

export function writeCatalog(root: string): Promise<number>;

export function main(argv?: string[]): Promise<number>;
