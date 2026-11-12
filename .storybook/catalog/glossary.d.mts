import type { Problem } from "./closed.mjs";

export interface GlossaryTerm {
	id: string;
	ui_label: string;
	definition: string;
	forms: string[];
	internal: string[];
	avoid: string[];
	surfaces: string[];
	status: string;
	reviewed: string;
	notes?: string | undefined;
}

export interface WordWaiver {
	word: string;
	class: string;
	reason: string;
}

export interface GlossaryDocument {
	schemaVersion: number;
	functionWords: string[];
	terms: GlossaryTerm[];
	wordWaivers: WordWaiver[];
}

export interface GlossaryContext {
	en: Record<string, string>;
	readText: (relPath: string) => string | null;
	internalExists: (identifier: string) => boolean;
}

export const GLOSSARY_PATH: string;
export const GLOSSARY_MD_PATH: string;
export const GLOSSARY_CODES: readonly string[];

export function normalizeText(text: string): string;

export function validateGlossary(
	doc: unknown,
	ctx: GlossaryContext,
): Problem[];

export function loadGlossaryContext(root: string): GlossaryContext;

export function renderGlossary(doc: GlossaryDocument): string;
