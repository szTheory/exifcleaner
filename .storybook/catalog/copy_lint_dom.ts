import { lintText, normalizeForLint } from "./copy_lint.mjs";
import type { CopyRuleset } from "./copy_lint.mjs";

// The rendered-text half of the copy lint (D-12): browser-only DOM reads, the
// pure lint stays in copy_lint.mjs. Nothing here mutates the document.

export interface CopyUnit {
	text: string;
}

export interface CopyLintOptions {
	// Substrings (a user's own file name, say) stripped before linting.
	fixtureText: readonly string[];
	// A unit whose whole text matches one of these is a baselined string.
	templates: readonly RegExp[];
}

export interface CopyLintHit {
	ruleId: string;
	match: string;
	text: string;
}

const TEXT_ATTRIBUTES = [
	"aria-label",
	"title",
	"alt",
	"placeholder",
	"aria-valuetext",
] as const;

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE"]);

// One unit per element: its own direct text nodes joined, plus each text
// attribute as a unit of its own. Portals are included because the caller
// starts at document.body; visually hidden text counts (it is still read).
export function collectCopyUnits(root: Element): CopyUnit[] {
	const units: CopyUnit[] = [];
	const visit = (element: Element): void => {
		if (SKIPPED_TAGS.has(element.tagName.toUpperCase())) return;
		let own = "";
		for (const child of Array.from(element.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				own += child.textContent ?? "";
			}
		}
		if (own.trim() !== "") units.push({ text: own });
		for (const attribute of TEXT_ATTRIBUTES) {
			const value = element.getAttribute(attribute);
			if (value !== null && value.trim() !== "") units.push({ text: value });
		}
		for (const child of Array.from(element.children)) visit(child);
	};
	visit(root);
	return units;
}

// A stripped fixture string leaves a non-word mask, so the words around it
// neither merge nor vanish.
const STRIPPED = "￼";

export function copyLintHits(
	units: readonly CopyUnit[],
	ruleset: CopyRuleset,
	options: CopyLintOptions,
): CopyLintHit[] {
	const hits: CopyLintHit[] = [];
	for (const unit of units) {
		let text = unit.text;
		for (const fixture of options.fixtureText) {
			if (fixture !== "") text = text.split(fixture).join(STRIPPED);
		}
		const whole = normalizeForLint(text);
		if (whole === "") continue;
		if (options.templates.some((template) => template.test(whole))) continue;
		for (const hit of lintText(whole, ruleset)) {
			hits.push({ ruleId: hit.ruleId, match: hit.match, text: unit.text });
		}
	}
	return hits;
}
