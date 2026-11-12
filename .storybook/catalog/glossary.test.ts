import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalJson } from "./closed.mjs";
import {
	GLOSSARY_CODES,
	GLOSSARY_MD_PATH,
	GLOSSARY_PATH,
	loadGlossaryContext,
	renderGlossary,
	validateGlossary,
	type GlossaryContext,
	type GlossaryDocument,
	type GlossaryTerm,
} from "./glossary.mjs";
import { repoRoot } from "./temp_repo";

const ctx: GlossaryContext = loadGlossaryContext(repoRoot);
const text = fs.readFileSync(path.join(repoRoot, GLOSSARY_PATH), "utf8");
const real = JSON.parse(text) as GlossaryDocument;

const RESERVED = [
	"stays-on-your-computer",
	"no-network-access",
	"open-source",
] as const;

function clone(): GlossaryDocument {
	return structuredClone(real);
}

function termOf(doc: GlossaryDocument, id: string): GlossaryTerm {
	const found = doc.terms.find((candidate) => candidate.id === id);
	if (found === undefined) throw new Error(`no term ${id}`);
	return found;
}

function codes(doc: unknown): string[] {
	return validateGlossary(doc, ctx).map((found) => found.code);
}

// A word that occurs in an en.json value yet belongs to no term's forms.
const FORM_IN_EN = "copyright";

describe("the real glossary", () => {
	test("real glossary with reserved brand terms is valid", () => {
		expect(validateGlossary(real, ctx)).toEqual([]);
		for (const id of RESERVED) {
			const term = termOf(real, id);
			expect(term.status).toBe("reserved");
			expect(term.surfaces).toEqual([]);
		}
	});

	test("anti-vacuity: 25 to 40 terms and the required ids", () => {
		expect(real.terms.length).toBeGreaterThanOrEqual(25);
		expect(real.terms.length).toBeLessThanOrEqual(40);
		const ids = new Set(real.terms.map((term) => term.id));
		for (const id of [
			"exifcleaner",
			"exif",
			"metadata",
			"fields",
			"remove",
			"original",
			"cleaned-copy",
			"save-as-copy",
			"unchanged",
			"icc-profile",
			"orientation",
			"timestamps",
			"macos-attributes",
			"finder-tags",
			...RESERVED,
		]) {
			expect(ids.has(id), id).toBe(true);
		}
		for (const term of real.terms) {
			if (term.status !== "reserved") {
				expect(term.surfaces.length, term.id).toBeGreaterThan(0);
			}
		}
	});

	test("the brand vocabulary table is entered with its Instead of column as avoid", () => {
		const avoid = (id: string) => termOf(real, id).avoid;
		expect(avoid("metadata")).toContain("exif data");
		expect(avoid("fields")).toEqual(
			expect.arrayContaining(["attributes", "info", "tags"]),
		);
		expect([...avoid("remove"), ...avoid("clean")].sort()).toEqual([
			"destroy",
			"nuke",
			"scrub",
			"wipe",
		]);
		expect(avoid("stays-on-your-computer")).toEqual([
			"anonymous",
			"secure",
			"untraceable",
		]);
		expect(avoid("no-network-access")).toContain("offline mode");
		expect(avoid("original")).toEqual(["input", "source file"]);
		expect(avoid("save-as-copy")).toEqual(["back up", "backup", "duplicate"]);
		expect(avoid("open-source")).toContain("free software project");
		expect(avoid("cleaned-copy")).toEqual(["output"]);
		expect(avoid("unchanged")).toEqual(["untouched"]);
	});
});

interface Mutant {
	name: string;
	code: string;
	mutate: (doc: GlossaryDocument) => unknown;
}

const MUTANTS: Mutant[] = [
	{ name: "a non-object document", code: "not-object", mutate: () => [] },
	{
		name: "schemaVersion 2",
		code: "schema-version",
		mutate: (doc) => ({ ...doc, schemaVersion: 2 }),
	},
	{
		name: "an unknown term field",
		code: "unknown-field",
		mutate: (doc) => {
			Object.assign(termOf(doc, "metadata"), { extra: 1 });
			return doc;
		},
	},
	{
		name: "a missing reviewed field",
		code: "missing-field",
		mutate: (doc) => {
			Reflect.deleteProperty(termOf(doc, "metadata"), "reviewed");
			return doc;
		},
	},
	{
		name: "forms that is not an array",
		code: "bad-type",
		mutate: (doc) => {
			Object.assign(termOf(doc, "metadata"), { forms: "metadata" });
			return doc;
		},
	},
	{
		name: "a non-kebab id",
		code: "bad-id",
		mutate: (doc) => {
			const last = doc.terms[doc.terms.length - 1];
			if (last === undefined) throw new Error("no terms");
			last.id = `${last.id}-`;
			return doc;
		},
	},
	{
		name: "a repeated id",
		code: "duplicate-id",
		mutate: (doc) => {
			const [first, second] = doc.terms;
			if (first === undefined || second === undefined) throw new Error("terms");
			second.id = first.id;
			return doc;
		},
	},
	{
		name: "an empty ui_label",
		code: "bad-label",
		mutate: (doc) => {
			termOf(doc, "metadata").ui_label = "";
			return doc;
		},
	},
	{
		name: "a ui_label that differs only in case from another",
		code: "duplicate-label",
		mutate: (doc) => {
			const fields = termOf(doc, "fields");
			const metadata = termOf(doc, "metadata");
			metadata.ui_label = fields.ui_label.toUpperCase();
			metadata.surfaces = [...fields.surfaces];
			return doc;
		},
	},
	{
		name: "a three-sentence definition",
		code: "bad-definition",
		mutate: (doc) => {
			termOf(doc, "metadata").definition = "One. Two. Three.";
			return doc;
		},
	},
	{
		name: "a 221-character definition",
		code: "bad-definition",
		mutate: (doc) => {
			termOf(doc, "metadata").definition = `${"x".repeat(220)}.`;
			return doc;
		},
	},
	{
		name: "a form that is not one lowercase word",
		code: "bad-form",
		mutate: (doc) => {
			termOf(doc, "metadata").forms = ["Two Words"];
			return doc;
		},
	},
	{
		name: "a forms word in two terms",
		code: "duplicate-form",
		mutate: (doc) => {
			const form = termOf(doc, "fields").forms[0];
			if (form === undefined) throw new Error("no form");
			termOf(doc, "metadata").forms.push(form);
			return doc;
		},
	},
	{
		name: "an avoid entry that is not lowercase words",
		code: "bad-avoid",
		mutate: (doc) => {
			termOf(doc, "metadata").avoid = ["Mixed Case"];
			return doc;
		},
	},
	{
		name: "an avoid entry equal to a forms entry",
		code: "avoid-is-form",
		mutate: (doc) => {
			termOf(doc, "metadata").avoid.push("metadata");
			return doc;
		},
	},
	{
		name: "an avoid entry under two terms",
		code: "avoid-shared",
		mutate: (doc) => {
			termOf(doc, "fields").avoid.push("exif data");
			return doc;
		},
	},
	{
		name: "an empty internal entry",
		code: "bad-internal",
		mutate: (doc) => {
			termOf(doc, "metadata").internal = [""];
			return doc;
		},
	},
	{
		name: "one internal value in two terms",
		code: "duplicate-internal",
		mutate: (doc) => {
			termOf(doc, "metadata").internal = ["removedFields"];
			return doc;
		},
	},
	{
		name: "an internal identifier outside the filtered trees",
		code: "internal-missing",
		mutate: (doc) => {
			termOf(doc, "metadata").internal = ["noSuchIdentifierQ"];
			return doc;
		},
	},
	{
		name: "a surface that escapes the root",
		code: "bad-surface",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("src:../x");
			return doc;
		},
	},
	{
		name: "an en surface for a key that does not exist",
		code: "surface-key-missing",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("en:no.such.key");
			return doc;
		},
	},
	{
		name: "an en surface whose value lacks the label",
		code: "surface-label-missing",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("en:toast.copied");
			return doc;
		},
	},
	{
		name: "a src surface to a file without the label",
		code: "surface-label-missing",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("src:src/common/platform.ts");
			return doc;
		},
	},
	{
		name: "a src surface to a file that does not exist",
		code: "surface-file-missing",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("src:src/no/such/file.ts");
			return doc;
		},
	},
	{
		name: "an os surface on a canonical term",
		code: "os-surface-status",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces.push("os:Finder menu");
			return doc;
		},
	},
	{
		name: "no surface on a canonical term",
		code: "missing-surface",
		mutate: (doc) => {
			termOf(doc, "metadata").surfaces = [];
			return doc;
		},
	},
	{
		name: "status retired",
		code: "bad-status",
		mutate: (doc) => {
			termOf(doc, "metadata").status = "retired";
			return doc;
		},
	},
	{
		name: "a reserved term whose label is already in en",
		code: "reserved-now-in-en",
		mutate: (doc) => {
			const term = termOf(doc, "metadata");
			term.status = "reserved";
			term.surfaces = [];
			return doc;
		},
	},
	{
		name: "reviewed 2026-02-30",
		code: "bad-date",
		mutate: (doc) => {
			termOf(doc, "metadata").reviewed = "2026-02-30";
			return doc;
		},
	},
	{
		name: "a function word that is not one lowercase word",
		code: "bad-function-word",
		mutate: (doc) => ({ ...doc, functionWords: ["Bad Word"] }),
	},
	{
		name: "a word waiver with an unknown class",
		code: "bad-word-waiver",
		mutate: (doc) => ({
			...doc,
			wordWaivers: [{ word: "widget", class: "nope", reason: "x" }],
		}),
	},
	{
		name: "an unsorted terms list",
		code: "unsorted",
		mutate: (doc) => {
			const [first, second] = doc.terms;
			if (first === undefined || second === undefined) throw new Error("terms");
			doc.terms[0] = second;
			doc.terms[1] = first;
			return doc;
		},
	},
];

describe("every rule code is shown red by its own mutant", () => {
	test.each(MUTANTS)("shown red: $name -> $code", ({ code, mutate }) => {
		expect(codes(mutate(clone()))).toEqual([code]);
	});

	test("the mutant codes are exactly GLOSSARY_CODES", () => {
		expect([...new Set(MUTANTS.map((mutant) => mutant.code))].sort()).toEqual([
			...GLOSSARY_CODES,
		]);
	});

	test("the preconditions of the picked words hold", () => {
		const forms = new Set(real.terms.flatMap((term) => term.forms));
		expect(forms.has(FORM_IN_EN)).toBe(false);
		expect(
			Object.values(ctx.en).some((value) => /\bcopyright\b/i.test(value)),
		).toBe(true);
		const platform = ctx.readText("src/common/platform.ts") ?? "";
		expect(platform.toLowerCase()).not.toContain("metadata");
		expect(ctx.en["toast.copied"]?.toLowerCase()).not.toContain("metadata");
	});
});

describe("reserved terms (amendment A-3)", () => {
	test("shown red: reserved label already in en", () => {
		const doc = clone();
		const term = termOf(doc, "metadata");
		term.status = "reserved";
		term.surfaces = [];
		expect(codes(doc)).toEqual(["reserved-now-in-en"]);
	});

	test("shown red: reserved form already in en", () => {
		const doc = clone();
		termOf(doc, "no-network-access").forms.push(FORM_IN_EN);
		expect(codes(doc)).toEqual(["reserved-now-in-en"]);
	});

	test("shown red: reserved surface still resolves", () => {
		const doc = clone();
		termOf(doc, "open-source").surfaces.push("src:../x");
		expect(codes(doc)).toEqual(["bad-surface"]);
	});

	test("shown red: current term without surface", () => {
		const doc = clone();
		const term = termOf(doc, "open-source");
		term.status = "canonical";
		term.surfaces = [];
		expect(codes(doc)).toEqual(["missing-surface"]);
	});

	test("a reserved term may carry a surface that resolves, but then it is in en", () => {
		const doc = clone();
		const term = termOf(doc, "stays-on-your-computer");
		term.surfaces = ["src:src/renderer/index.html"];
		// index.html holds no "stays on your computer", so the surface check reports it.
		expect(codes(doc)).toEqual(["surface-label-missing"]);
	});
});

describe("empty and edge input", () => {
	test("a term with internal [] is valid", () => {
		expect(termOf(clone(), "metadata").internal).toEqual([]);
		expect(codes(clone())).toEqual([]);
	});

	test("an empty glossary is valid", () => {
		expect(
			codes({
				schemaVersion: 1,
				functionWords: [],
				terms: [],
				wordWaivers: [],
			}),
		).toEqual([]);
	});

	test("duplicate labels, forms, avoid and internal each stand alone", () => {
		for (const code of [
			"duplicate-label",
			"duplicate-form",
			"avoid-is-form",
			"duplicate-internal",
		]) {
			const mutant = MUTANTS.find((candidate) => candidate.code === code);
			expect(mutant, code).toBeDefined();
		}
	});
});

describe("canonical form and ordering", () => {
	function formProblems(source: string): string[] {
		const doc = JSON.parse(source) as GlossaryDocument;
		const found: string[] = [];
		if (source !== canonicalJson(doc)) found.push("not-canonical");
		const sorted = (items: string[]) =>
			items.every(
				(item, index) => index === 0 || (items[index - 1] ?? "") <= item,
			);
		if (!sorted(doc.terms.map((term) => term.id))) found.push("terms-unsorted");
		if (!sorted(doc.functionWords)) found.push("functionWords-unsorted");
		if (!sorted(doc.wordWaivers.map((waiver) => waiver.word))) {
			found.push("wordWaivers-unsorted");
		}
		return found;
	}

	test("glossary.json is canonical and sorted by code unit", () => {
		expect(formProblems(text)).toEqual([]);
	});

	test("shown red: an unsorted clone fails the canonical-form test", () => {
		const doc = clone();
		doc.terms.reverse();
		expect(formProblems(canonicalJson(doc))).toEqual(["terms-unsorted"]);
		expect(formProblems(JSON.stringify(real))).toEqual(["not-canonical"]);
	});

	test("every en.json value equals its own NFC form", () => {
		for (const [key, value] of Object.entries(ctx.en)) {
			expect(value, key).toBe(value.normalize("NFC"));
		}
	});
});

describe("GLOSSARY.md rendering", () => {
	const rendered = renderGlossary(real);

	test("the committed GLOSSARY.md equals a fresh render", () => {
		expect(fs.readFileSync(path.join(repoRoot, GLOSSARY_MD_PATH), "utf8")).toBe(
			rendered,
		);
	});

	test("banner first, three status groups, reserved marker and the map table", () => {
		const lines = rendered.split("\n");
		expect(lines[0]).toContain("yarn catalog:write");
		expect(rendered).toContain("## In the product");
		expect(rendered).toContain("## Technical detail only");
		expect(rendered).toContain("## Owned by the OS");
		expect(rendered.match(/\(reserved\):/g)?.length).toBe(3);
		expect(rendered).toContain(
			"| internal | ui_label | avoid | surfaces | status | reviewed |",
		);
		const internals = real.terms.reduce(
			(n, term) => n + term.internal.length,
			0,
		);
		expect(
			rendered.split("\n").filter((line) => line.startsWith("| ")).length,
		).toBe(internals + 2);
		expect(rendered.endsWith("\n")).toBe(true);
		expect(rendered.endsWith("\n\n")).toBe(false);
		expect(rendered).not.toContain("\r");
	});

	test("equal inputs render the same bytes whatever the input order", () => {
		const shuffled = clone();
		shuffled.terms.reverse();
		expect(renderGlossary(shuffled)).toBe(rendered);
	});

	test("each internal entry has one row, sorted by the internal value", () => {
		const rows = rendered
			.split("\n")
			.filter(
				(line) =>
					line.startsWith("| ") &&
					!line.startsWith("| internal") &&
					!line.startsWith("| ---"),
			)
			.map((line) => line.split(" | ")[0]?.slice(2) ?? "");
		expect(rows).toEqual([...rows].sort());
		expect(rows).toEqual(
			expect.arrayContaining([
				"removedFields",
				"xattr",
				"themeMode",
				"outputPath",
			]),
		);
	});
});
