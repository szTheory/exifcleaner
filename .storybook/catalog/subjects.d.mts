import type { Problem } from "./closed.mjs";

export interface SubjectScan {
	ids: string[];
	collisions: string[];
}

export const SUBJECTS_PATH: string;

export const SUBJECT_CODES: readonly string[];

export function scanSubjectIds(root: string): SubjectScan;

export function validateSubjects(
	doc: unknown,
	scan: { ids: readonly string[]; collisions: readonly string[] },
): Problem[];

export function loadSubjects(root: string): Map<string, string>;
