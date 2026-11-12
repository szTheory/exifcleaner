export interface LintProblem {
	code: string;
	message: string;
}

export interface CompiledRule {
	readonly id: string;
	readonly category: string;
	readonly message: string;
	readonly bad: string;
	readonly ok: string;
	readonly derived: boolean;
	readonly regex: RegExp;
	readonly masks: readonly RegExp[];
}

export interface CopyRuleset {
	readonly rules: readonly CompiledRule[];
}

export interface LintHit {
	ruleId: string;
	match: string;
}

export const RULE_CATEGORIES: readonly string[];

export const RULE_BASES: readonly string[];

export const RULE_CODES: readonly string[];

export function validateRules(
	rulesDoc: unknown,
	brandPin: string,
): LintProblem[];

export function normalizeForLint(text: string): string;

export function buildRuleset(
	rulesDoc: unknown,
	glossaryDoc: unknown,
): CopyRuleset;

export function lintText(text: string, ruleset: CopyRuleset): LintHit[];

export function selfTestProblems(
	ruleset: CopyRuleset,
): Array<{ ruleId: string; side: "bad" | "ok" }>;

export function templatePattern(enValue: string): RegExp;

export function excusedTemplates(
	registerDoc: unknown,
	en: Readonly<Record<string, string>>,
): RegExp[];
