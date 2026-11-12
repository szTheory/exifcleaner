import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	staleWordWaivers,
	tokenize,
	uncoveredWords,
	type CoverageGlossary,
} from "./content_words.mjs";
import { GLOSSARY_PATH, type GlossaryDocument } from "./glossary.mjs";
import { scanRenderer, uniquePairs } from "./hardcoded_scan.mjs";
import { repoRoot } from "./temp_repo";

// LANG-01 asks that every noun on a user-facing surface be in the glossary.
// This check is stricter than that wording: with no NLP and no dependency a
// "noun" is operationalized as any content word, so every word of every
// non-menu en.json value must be a function word, a term's form or a reviewed
// waiver (D-07). The dictionary is a parameter, so the negative control below
// plants a word in a copy and en.json is never edited.

const en = JSON.parse(
	fs.readFileSync(path.join(repoRoot, ".resources/locales/en.json"), "utf8"),
) as Record<string, string>;
const glossary = JSON.parse(
	fs.readFileSync(path.join(repoRoot, GLOSSARY_PATH), "utf8"),
) as GlossaryDocument;

describe("tokenize", () => {
	test("placeholders yield no tokens", () => {
		expect(tokenize("{count}")).toEqual([]);
		expect(tokenize("{a} {b}")).toEqual([]);
	});

	test("curly apostrophes become straight and 's is stripped", () => {
		expect(tokenize("Couldn’t verify")).toEqual(["couldn't", "verify"]);
		expect(tokenize("file's")).toEqual(["file"]);
		expect(tokenize("the files'")).toEqual(["the", "files"]);
	});

	test("words are lowercased letters only, so digits and punctuation split", () => {
		expect(tokenize("{count} files · 3 GB!")).toEqual(["files", "gb"]);
	});
});

describe("uncoveredWords", () => {
	test("the real dictionary is fully covered (anti-vacuity: the lists are used)", () => {
		expect(glossary.functionWords.length).toBeGreaterThan(20);
		expect(glossary.wordWaivers.length).toBeGreaterThan(10);
		expect(Object.keys(en).length).toBeGreaterThan(100);
		expect(uncoveredWords(en, glossary)).toEqual([]);
	});

	test("shown red: a planted noun is reported exactly, and en.json is untouched", () => {
		const planted = { ...en, "planted.widget": "Widget {count} of Widgets" };
		expect(uncoveredWords(planted, glossary)).toEqual([
			"planted.widget:widget",
			"planted.widget:widgets",
		]);
		expect(en["planted.widget"]).toBeUndefined();
	});

	test("an empty dictionary and a placeholder-only value report nothing", () => {
		expect(uncoveredWords({}, glossary)).toEqual([]);
		expect(uncoveredWords({ "a.b": "{count}" }, glossary)).toEqual([]);
	});

	test("menu keys are exempt", () => {
		expect(uncoveredWords({ "menu.edit.speech": "Widget" }, glossary)).toEqual(
			[],
		);
		expect(uncoveredWords({ "menus.edit.speech": "Widget" }, glossary)).toEqual(
			["menus.edit.speech:widget"],
		);
	});

	test(".one and .other report a word once, under the base key", () => {
		const dict = {
			"planted.items.one": "{count} Widget",
			"planted.items.other": "{count} Widget",
		};
		expect(uncoveredWords(dict, glossary)).toEqual(["planted.items:widget"]);
	});

	test("avoid words and avoid phrases are left to copy-lint", () => {
		expect(uncoveredWords({ "a.b": "Your tags" }, glossary)).toEqual([]);
		expect(uncoveredWords({ "a.b": "Offline mode" }, glossary)).toEqual([]);
		expect(uncoveredWords({ "a.b": "Online widget" }, glossary)).toEqual([
			"a.b:online",
			"a.b:widget",
		]);
	});

	test("a form covers its word and a waiver covers its word", () => {
		const bare: CoverageGlossary = {
			functionWords: [],
			terms: [{ forms: ["widget"], avoid: [] }],
			wordWaivers: [{ word: "gadget" }],
		};
		expect(uncoveredWords({ "a.b": "Widget gadget gizmo" }, bare)).toEqual([
			"a.b:gizmo",
		]);
	});
});

describe("staleWordWaivers", () => {
	const literals = uniquePairs(scanRenderer(repoRoot)).map(
		(pair) => pair.literal,
	);

	test("every waiver still occurs in en.json or a hardcoded renderer literal", () => {
		expect(literals.length).toBe(18);
		expect(staleWordWaivers(en, glossary, literals)).toEqual([]);
	});

	test("shown red: a waiver that occurs nowhere is named", () => {
		const planted: CoverageGlossary = {
			...glossary,
			wordWaivers: [...glossary.wordWaivers, { word: "zzzplanted" }],
		};
		expect(staleWordWaivers(en, planted, literals)).toEqual(["zzzplanted"]);
	});

	test("a waiver that only a hardcoded literal uses is still current", () => {
		const waivers = { wordWaivers: [{ word: "processing" }] };
		expect(staleWordWaivers({}, waivers, ["Processing"])).toEqual([]);
		expect(staleWordWaivers({}, waivers, [])).toEqual(["processing"]);
	});
});
