export interface Problem {
	code: string;
	message: string;
	id?: string | undefined;
	[extra: string]: unknown;
}

export function isPlainObject(value: unknown): value is Record<string, unknown>;

export function problem(
	code: string,
	message: string,
	extra?: Record<string, unknown>,
): Problem;

export function closedKeys(
	obj: Record<string, unknown>,
	required: readonly string[],
	optional: readonly string[],
	where: string,
): Problem[];

export function isNonEmptyString(value: unknown): value is string;

export function isCalendarDate(text: unknown): boolean;

export function resolveInRoot(root: string, relPath: unknown): string | null;

export function readJson(root: string, relPath: string): unknown;

export function canonicalJson(value: unknown): string;

export function compareCodeUnits(a: string, b: string): number;

export function sortProblems<T extends Problem>(problems: readonly T[]): T[];
