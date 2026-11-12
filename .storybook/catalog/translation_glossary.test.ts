import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { GLOSSARY_PATH, type GlossaryDocument } from "./glossary.mjs";
import { repoRoot } from "./temp_repo";

// D-06: the translator glossary and the i18n workflow stay untouched. This
// test only asserts that every translator term still resolves to a glossary
// ui_label, id or internal entry (case-insensitive), so the two cannot drift.
interface TranslatorDocument {
	terms: Record<string, unknown>;
}

const translator = JSON.parse(
	fs.readFileSync(
		path.join(repoRoot, ".resources/translation-glossary.json"),
		"utf8",
	),
) as TranslatorDocument;
const glossary = JSON.parse(
	fs.readFileSync(path.join(repoRoot, GLOSSARY_PATH), "utf8"),
) as GlossaryDocument;

function unmatched(document: TranslatorDocument): string[] {
	const known = new Set<string>();
	for (const term of glossary.terms) {
		known.add(term.id.toLowerCase());
		known.add(term.ui_label.toLowerCase());
		for (const internal of term.internal) known.add(internal.toLowerCase());
	}
	return Object.keys(document.terms).filter(
		(name) => !known.has(name.toLowerCase()),
	);
}

describe("translation glossary consistency", () => {
	test("the translator glossary still has its ten terms (anti-vacuity)", () => {
		expect(Object.keys(translator.terms)).toHaveLength(10);
	});

	test("every translator term matches a glossary ui_label, id or internal entry", () => {
		expect(unmatched(translator)).toEqual([]);
	});

	test("Save as Copy resolves through case and timestamps through the id", () => {
		const saveAsCopy = glossary.terms.find(
			(term) => term.id === "save-as-copy",
		);
		expect(saveAsCopy?.ui_label.toLowerCase()).toBe("save as copy");
		expect(glossary.terms.some((term) => term.id === "timestamps")).toBe(true);
	});

	test("shown red: a cloned translator document with an extra term is reported", () => {
		const cloned: TranslatorDocument = {
			...translator,
			terms: { ...translator.terms, Widget: {} },
		};
		expect(unmatched(cloned)).toEqual(["Widget"]);
	});
});
