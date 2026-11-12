import type { Problem } from "./closed.mjs";
import type { CopyRuleset } from "./copy_lint.mjs";

export type CatalogSource =
	| { kind: "issue"; by: string; refs: string[] }
	| { kind: "code"; path: string; symbol: string }
	| { kind: "string"; key: string }
	| { kind: "brand"; pin: string; section: string }
	| { kind: "maintainer"; date: string; doc: string }
	| { kind: "none" };

export interface CatalogClaim {
	field: string;
	about: string;
	tag: string;
	text: string;
	source: CatalogSource;
	validateBy?: string | undefined;
}

export interface CatalogRedFlag {
	id: string;
	kind: string;
	tag: string;
	text: string;
	source: CatalogSource;
	states: string[];
	jobs: string[];
	validateBy?: string | undefined;
	forbidden?: string[] | undefined;
	gate?: string | undefined;
}

export interface CatalogPersona {
	id: string;
	label: string;
	claims: CatalogClaim[];
	redFlags: CatalogRedFlag[];
}

export interface CatalogJob {
	id: string;
	when: string;
	want: string;
	so: string;
	personas: string[];
	claims: CatalogClaim[];
}

export interface CatalogDocument {
	schemaVersion: number;
	coreJob: { statement: string; clauses: CatalogClaim[] };
	personas: CatalogPersona[];
	jobs: CatalogJob[];
}

export interface CatalogContext {
	readText: (relPath: string) => string | null;
	enKeys: readonly string[];
	brandPin: string;
	ruleset: CopyRuleset;
	glossary: unknown;
}

export interface LoadedCatalog {
	personaIds: string[];
	jobIds: string[];
	jobPersonas: Record<string, string[]>;
	redFlags: Array<{
		id: string;
		persona: string;
		kind: string;
		states: string[];
		jobs: string[];
	}>;
}

export const CATALOG_PATH: string;
export const PERSONAS_MD_PATH: string;
export const CATALOG_CODES: readonly string[];

export function validateCatalog(doc: unknown, ctx: CatalogContext): Problem[];

export function loadCatalogContext(root: string): CatalogContext;

export function loadCatalog(root: string): LoadedCatalog;

export function renderPersonas(doc: CatalogDocument): string;
