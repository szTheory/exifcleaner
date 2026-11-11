export interface BaselineEntry {
	fingerprint: string;
	kind: string;
	story: string;
	rule: string;
	reason: string;
	disposition?: string;
}

export interface BaselineDocument {
	schemaVersion: number;
	kinds: Record<string, { sealed: boolean }>;
	entries: BaselineEntry[];
}

export interface RatchetProblem {
	code: string;
	message: string;
}

export const BASELINE_PATH: string;

export function fingerprint(kind: string, ...parts: string[]): string;

export function validateBaseline(doc: unknown): RatchetProblem[];

export function diffBaseline(
	base: BaselineDocument | null,
	head: BaselineDocument,
): { added: BaselineEntry[]; removed: BaselineEntry[] };

export function check(subject: {
	head: BaselineDocument;
	base: BaselineDocument | null;
	observed?: Set<string>;
}): { ok: boolean; problems: RatchetProblem[] };

export function prune(subject: {
	head: BaselineDocument;
	base: BaselineDocument | null;
	observed: Set<string>;
}):
	| { ok: true; doc: BaselineDocument }
	| { ok: false; problems: RatchetProblem[] };

export function main(argv?: string[]): number;
