import type { Problem } from "./closed.mjs";

// A brand colour reference: the tokens.json dotted path and its uppercase #RRGGBB.
export interface TokenMapBrandRef {
	token: string;
	hex: string;
}

export interface TokenMapBrand {
	light: TokenMapBrandRef;
	dark: TokenMapBrandRef;
}

interface TokenMapEntryBase {
	name: string;
	// The UI-SPEC value id this property realises (Open Question 5).
	spec?: string | undefined;
	// The `var(--x)` a backward-compat alias points at in both theme blocks.
	aliasOf?: string | undefined;
}

export interface TokenMapAdopt extends TokenMapEntryBase {
	disposition: "adopt";
	brand: TokenMapBrand;
}

export interface TokenMapDerive extends TokenMapEntryBase {
	disposition: "derive";
	from: string[];
	rule: string;
}

export interface TokenMapKeepPlatform extends TokenMapEntryBase {
	disposition: "keep-platform";
	reason: string;
}

export interface TokenMapProposeUpstream extends TokenMapEntryBase {
	disposition: "propose-upstream";
	owner: string;
	decision: string;
}

export interface TokenMapRetire extends TokenMapEntryBase {
	disposition: "retire";
	reason: string;
	// A fingerprint in docs/evidence/known-findings.json.
	finding?: string | undefined;
}

export interface TokenMapLocal extends TokenMapEntryBase {
	disposition: "local";
	reason: string;
}

export type TokenMapEntry =
	| TokenMapAdopt
	| TokenMapDerive
	| TokenMapKeepPlatform
	| TokenMapProposeUpstream
	| TokenMapRetire
	| TokenMapLocal;

export interface TokenMapDocument {
	schemaVersion: number;
	brandPin: string;
	entries: TokenMapEntry[];
}

export interface TokenMapContext {
	brandPin: string;
	tokensCss: string;
	// Repo-relative path -> text, every file under src/renderer the scan reads.
	sources: Record<string, string>;
	findings: Array<{ fingerprint: string; kind: string }>;
	specIds: string[];
	// Brand path -> the hex the UI-SPEC pairs with it.
	specTokenHexes: Record<string, string>;
}

export interface DeclaredTokens {
	root: Map<string, string>;
	dark: Map<string, string>;
	other: Array<{ selectors: string[]; name: string; line: number }>;
}

export const TOKEN_MAP_PATH: string;
export const TOKEN_MAP_MD_PATH: string;
export const TOKENS_CSS_PATH: string;
export const TOKEN_MAP_CODES: readonly string[];

export function declaredTokens(tokensCss: string): DeclaredTokens;

export function usedTokens(sources: Record<string, string>): string[];

export function validateTokenMap(doc: unknown, ctx: TokenMapContext): Problem[];

export function loadTokenMapContext(root: string): TokenMapContext;

export function renderTokenMap(doc: TokenMapDocument): string;
