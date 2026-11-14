interface StateClassDefinition {
	readonly definition: string;
	readonly classifyLike: string;
	readonly anchors: readonly string[];
}

export const STATE_CLASSES: readonly string[];
export const STATE_CLASS_TIEBREAK: readonly string[];
export const STATE_CLASS_DEFS: Readonly<Record<string, StateClassDefinition>>;
export const TIERS: readonly string[];
export const TIER_DUE: Readonly<Record<string, string>>;
export const PROOF_BOUNDARIES: readonly string[];
export const GLOSSARY_STATUSES: readonly string[];
export const SURFACE_PREFIXES: readonly string[];
export const WORD_WAIVER_CLASSES: readonly string[];
export const FINDING_KINDS: readonly string[];
export const FINDING_SURFACES: readonly string[];
export const DISPOSITIONS: readonly string[];
export const PERSONA_IDS: readonly string[];
export const CLAIM_TAGS: readonly string[];
export const CLAIM_ABOUT: readonly string[];
export const SOURCE_KINDS: readonly string[];
export const VALIDATE_BY: readonly string[];
export const RED_FLAG_KINDS: readonly string[];
export const WAIVER_BASES: readonly string[];
export const TERM_ID_PATTERN: RegExp;
export const JOB_ID_PATTERN: RegExp;
export const RED_FLAG_ID_PATTERN: RegExp;
export const SCENARIO_ID_PATTERN: RegExp;
export const FILTERED_TREES: readonly string[];
export const UI_SPEC_SECTIONS: readonly string[];
export const UI_SPEC_BASES: readonly string[];
export const UI_SPEC_STATES: readonly string[];
export const UI_SPEC_THEMES: readonly string[];
