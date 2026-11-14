import type { Problem } from "./closed.mjs";

// Exactly one of these keys names where a value comes from (D-28).
export interface UiSpecTokensSource {
	path: string;
	value: string;
}

export interface UiSpecBrandSource {
	section: string;
	quote: string;
}

export interface UiSpecAppSource {
	basis: string;
	reason: string;
}

export interface UiSpecSources {
	tokens?: UiSpecTokensSource | undefined;
	brand?: UiSpecBrandSource | undefined;
	app?: UiSpecAppSource | undefined;
}

export interface UiSpecValue extends UiSpecSources {
	id: string;
	value: string;
}

// A states cell holds either a value with one source, or `na` with a reason.
export interface UiSpecCell extends UiSpecSources {
	component: string;
	state: string;
	theme: string;
	value?: string | undefined;
	na?: string | undefined;
}

export interface UiSpecStates {
	components: string[];
	cells: UiSpecCell[];
}

export interface UiSpecDocument {
	schemaVersion: number;
	brandPin: string;
	type: UiSpecValue[];
	radii: UiSpecValue[];
	spacing: UiSpecValue[];
	focus: UiSpecValue[];
	states: UiSpecStates;
	darkRinse: UiSpecValue[];
	motion: UiSpecValue[];
	platformOwned: UiSpecValue[];
}

export interface UiSpecContext {
	brandPin: string;
}

export const UI_SPEC_PATH: string;
export const UI_SPEC_MD_PATH: string;
export const UI_SPEC_CODES: readonly string[];

export function validateUiSpec(doc: unknown, ctx: UiSpecContext): Problem[];

export function loadUiSpecContext(root: string): UiSpecContext;

export function renderUiSpec(doc: UiSpecDocument): string;
