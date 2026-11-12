// Content-word coverage of en.json against the glossary (LANG-01, D-07).
//
// "Noun" in LANG-01 is operationalized as "content word" (no NLP, no
// dependency): stricter than the requirement's wording. Every word of every
// non-menu en.json value must be a function word, a term's form, or a
// reviewed waiver. The dictionary is a parameter, so a negative control feeds a
// planted copy and en.json is never edited.

// Menu items carry OS-owned names (Services, Speech, Hide Others). copy-lint
// still scans them, and the frozen key-set test makes a new menu.* key reviewed.
const EXEMPT_PREFIX = "menu.";

/**
 * Placeholders removed, curly apostrophes mapped to U+0027, lowercased, a
 * trailing 's then a trailing ' stripped. No Unicode normalization.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
	const cleaned = text.replace(/\{[^}]*\}/g, " ").replace(/[‘’]/g, "'");
	return (cleaned.match(/[\p{L}][\p{L}']*/gu) ?? []).map((word) =>
		word.toLowerCase().replace(/'s$/, "").replace(/'$/, ""),
	);
}

function foldPlural(key) {
	return key.replace(/\.(one|other)$/, "");
}

function avoidIndex(glossary) {
	const words = new Set();
	const phrases = [];
	for (const term of glossary.terms) {
		for (const entry of term.avoid) {
			if (entry.includes(" ")) {
				phrases.push(entry);
			} else {
				words.add(entry);
			}
		}
	}
	return { words, phrases };
}

/**
 * @param {Record<string, string>} dict
 * @param {{ functionWords: string[], terms: Array<{ forms: string[], avoid: string[] }>, wordWaivers: Array<{ word: string }> }} glossary
 * @returns {string[]} sorted `key:word` entries
 */
export function uncoveredWords(dict, glossary) {
	const covered = new Set(glossary.functionWords);
	for (const term of glossary.terms) {
		for (const form of term.forms) covered.add(form);
	}
	for (const waiver of glossary.wordWaivers) covered.add(waiver.word);
	const avoid = avoidIndex(glossary);

	const found = new Set();
	for (const [key, value] of Object.entries(dict)) {
		if (key.startsWith(EXEMPT_PREFIX)) continue;
		const base = foldPlural(key);
		// Words inside an avoid phrase present in the string belong to copy-lint.
		const owned = new Set();
		const lowered = value.toLowerCase();
		for (const phrase of avoid.phrases) {
			if (lowered.includes(phrase)) {
				for (const word of tokenize(phrase)) owned.add(word);
			}
		}
		for (const word of tokenize(value)) {
			if (covered.has(word) || avoid.words.has(word) || owned.has(word)) {
				continue;
			}
			found.add(`${base}:${word}`);
		}
	}
	return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Waiver words that occur in no en.json value and no hardcoded renderer
 * literal: waivers shrink as the copy improves, so a dead one is reported.
 *
 * @param {Record<string, string>} dict
 * @param {{ wordWaivers: Array<{ word: string }> }} glossary
 * @param {readonly string[]} literals
 * @returns {string[]}
 */
export function staleWordWaivers(dict, glossary, literals) {
	const present = new Set();
	for (const value of [...Object.values(dict), ...literals]) {
		for (const word of tokenize(value)) present.add(word);
	}
	return glossary.wordWaivers
		.map((waiver) => waiver.word)
		.filter((word) => !present.has(word))
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
