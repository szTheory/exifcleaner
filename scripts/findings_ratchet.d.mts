export interface BaselineEntry {
	fingerprint: string;
	kind: string;
	story: string;
	rule: string;
	reason: string;
	disposition: string;
	// Required for every register kind; axe kinds derive it (major) in the view.
	severity?: string | undefined;
}

// One row of the verdict log: the maintainer's recorded decision to reject a finding.
export interface Verdict {
	fingerprint: string;
	verdict: string;
	reason: string;
	decidedAt: string;
	decidedBy: string;
	reply: string;
}

export interface BaselineDocument {
	schemaVersion: number;
	kinds: Record<string, { sealed: boolean }>;
	entries: BaselineEntry[];
	// Absent counts as []: the merge-base copy on master has no verdicts.
	verdicts?: Verdict[] | undefined;
}

export interface RatchetProblem {
	code: string;
	message: string;
}

export const BASELINE_PATH: string;

export const DISPOSITIONS: readonly string[];

export const SEVERITIES: readonly string[];

export const REGISTER_KINDS: readonly string[];

export const AXE_KIND: RegExp;

export const FINDINGS_RATCHET_CODES: readonly string[];

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
