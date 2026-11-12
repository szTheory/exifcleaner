import type { CopyRuleset } from "./copy_lint.mjs";

export interface CopyFindingEntry {
	fingerprint: string;
	kind: string;
	surface: string;
	ref: string;
	text: string;
	disposition: string;
	reason: string;
}

export interface CopyFindingsDocument {
	schemaVersion: number;
	entries: CopyFindingEntry[];
}

export interface RatchetProblem {
	code: string;
	message: string;
	id?: string | undefined;
}

export interface ObservedDeviation {
	fingerprint: string;
	kind: string;
	surface: string;
	ref: string;
	text: string;
}

export interface CopyObservation {
	observed: ObservedDeviation[];
	en: Record<string, string>;
	readText: (relPath: string) => string | null;
}

export const COPY_FINDINGS_PATH: string;

export const COPY_FINDINGS_CODES: readonly string[];

export function fingerprintFor(kind: string, parts: readonly string[]): string;

export function validateRegister(doc: unknown): RatchetProblem[];

export function observeDeviations(input: {
	en: Record<string, string>;
	ruleset: CopyRuleset;
	pairs: ReadonlyArray<{ path: string; literal: string }>;
}): ObservedDeviation[];

export function observationFrom(input: {
	en: Record<string, string>;
	ruleset: CopyRuleset;
	pairs: ReadonlyArray<{ path: string; literal: string }>;
	readText: (relPath: string) => string | null;
}): CopyObservation;

export function loadObservation(root: string): CopyObservation;

export function check(subject: {
	head: unknown;
	base: unknown;
	observation: CopyObservation;
}): { ok: boolean; problems: RatchetProblem[]; notes: string[] };

export function prune(subject: {
	head: unknown;
	base: unknown;
	observation: CopyObservation;
}):
	| { ok: true; doc: CopyFindingsDocument }
	| { ok: false; problems: RatchetProblem[] };

export function main(argv?: string[]): number;
