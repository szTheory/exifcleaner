export const BASELINE: string;
export const TOGGLE_TRANSITION: string;
export const EXCEPTIONS_PATH: string;
export const EXPECTED_EXCEPTIONS: Readonly<Record<string, unknown>>;

export function readGitSnapshot(ref: string, cwd?: string): Map<string, Buffer>;

export function changedPaths(
	base: string,
	head: string,
	cwd?: string,
): string[];

export function jsxStructure(
	files: ReadonlyMap<string, Buffer | string>,
	file: string,
	version: "baseline" | "candidate",
): string;

export function motionSignature(files: ReadonlyMap<string, Buffer | string>): {
	declarations: unknown[];
	keyframes: unknown[];
};

export function compareSnapshots(args: {
	baseFiles: ReadonlyMap<string, Buffer | string>;
	candidateFiles: ReadonlyMap<string, Buffer | string>;
	paths?: string[];
	baseRef?: string;
}): string[];
