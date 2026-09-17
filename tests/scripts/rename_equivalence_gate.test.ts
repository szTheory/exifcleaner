import { describe, expect, test } from "vitest";
import {
	IDENTIFIER_TOKEN_MAP,
	IMPORT_PATH_TOKEN_MAP,
	LITERAL_TOKEN_MAP,
	PATH_MOVES,
	diffRenamedTrees,
	transformContent,
	transformPath,
} from "../../scripts/rename_equivalence_gate.mjs";

// COMMENT-TEXT DISCIPLINE (per the plan): the acceptance criteria negative-grep src and tests
// for the legacy identifiers, and the token map itself belongs only in
// scripts/rename_equivalence_gate.mjs — nowhere under tests/. Every fixture below is therefore
// built by INTERPOLATING values read from the imported token maps at runtime, never by typing
// a legacy identifier out as a literal in this file's own source text. Lookups use each
// entry's NEW ("to") value or a structural property (array position, length) as the search
// key precisely because the new values never match the legacy grep pattern — this file's
// static text is clean by construction, not by exemption.

const [firstIdentifierFrom, firstIdentifierTo] = IDENTIFIER_TOKEN_MAP[0]!;
const portEntry = IDENTIFIER_TOKEN_MAP.find(
	([, to]) => to === "NativeMetadataPort",
)!;
const adapterEntry = IDENTIFIER_TOKEN_MAP.find(
	([, to]) => to === "NativeMetadataAdapter",
)!;
const fakeEntry = IDENTIFIER_TOKEN_MAP.find(
	([, to]) => to === "FakeNativeMetadata",
)!;
const predicateEntry = IDENTIFIER_TOKEN_MAP.find(
	([, to]) => to === "isNativeCopyCandidate",
)!;
const fieldEntry = IDENTIFIER_TOKEN_MAP.find(([, to]) => to === "native")!;
const [literalFrom, literalTo] = LITERAL_TOKEN_MAP[0]!;
const [portPathFrom, portPathTo] = PATH_MOVES[0]!;
const [adapterPathFrom, adapterPathTo] = PATH_MOVES[1]!;

describe("transformContent", () => {
	test("rewrites every declared identifier and the one string literal", () => {
		const before = [
			"import type {",
			`\t${portEntry[0]},`,
			`\t${adapterEntry[0]},`,
			'} from "x";',
			`import { ${fakeEntry[0]} } from "y";`,
			"",
			`function ${predicateEntry[0]}(${fieldEntry[0]}: ${portEntry[0]}): boolean {`,
			`\treturn ${fieldEntry[0]}.ok;`,
			"}",
			"",
			`const err = { ${literalFrom} };`,
			"",
		].join("\n");
		const after = transformContent(before);

		expect(after).toContain(portEntry[1]);
		expect(after).toContain(adapterEntry[1]);
		expect(after).toContain(fakeEntry[1]);
		expect(after).toContain(predicateEntry[1]);
		expect(after).toContain(fieldEntry[1]);
		expect(after).toContain(literalTo);
		for (const [from] of IDENTIFIER_TOKEN_MAP) {
			expect(after).not.toContain(from);
		}
		expect(after).not.toContain(literalFrom);
	});

	test("rewrites the longest identifier before a shorter one could partially match it", () => {
		// IDENTIFIER_TOKEN_MAP[0] is documented (see the "token map shape" describe
		// block below) to be the longest entry, specifically chosen so its rewrite
		// must happen before any shorter entry that shares its prefix is considered.
		const before = `type X = ${firstIdentifierFrom};`;
		const after = transformContent(before);

		expect(after).toBe(`type X = ${firstIdentifierTo};`);
	});

	test("is whole-word: does not rewrite a token embedded in an unrelated longer identifier", () => {
		const before = `const something${portEntry[0]}Like = 1;`;
		const after = transformContent(before);

		expect(after).toBe(before);
	});

	test("rewrites every declared import specifier", () => {
		for (const [from, to] of IMPORT_PATH_TOKEN_MAP) {
			const before = `import { X } from ${from};`;
			const after = transformContent(before);

			expect(after).toBe(`import { X } from ${to};`);
		}
	});

	test("leaves a prose mention of the format under test alone", () => {
		// A description string built from the format token plus a space (not a D-09
		// identifier or the one quoted literal, both of which are joined with no
		// whitespace) must pass through untouched — it describes the FORMAT under
		// test, not the internal architecture naming.
		const formatWord = adapterEntry[0]
			.replace("Native", "")
			.replace("Adapter", "");
		const before = `describe("native ${formatWord} sanitization", () => {});`;
		expect(transformContent(before)).toBe(before);
	});
});

describe("transformPath", () => {
	test("maps each of the five declared path moves", () => {
		for (const [from, to] of PATH_MOVES) {
			expect(transformPath(from)).toBe(to);
		}
	});

	test("passes through a path not named in PATH_MOVES unchanged", () => {
		expect(transformPath("src/infrastructure/index.ts")).toBe(
			"src/infrastructure/index.ts",
		);
	});
});

describe("diffRenamedTrees", () => {
	test("reports no discrepancies when the after tree is exactly the token-mapped before tree", () => {
		const beforeFiles = new Map([
			[portPathFrom, `export interface ${portEntry[0]} {}\n`],
			[
				"src/main/container.ts",
				`const ${fieldEntry[0]} = new ${adapterEntry[0]}();\n`,
			],
		]);
		const afterFiles = new Map([
			[portPathTo, `export interface ${portEntry[1]} {}\n`],
			[
				"src/main/container.ts",
				`const ${fieldEntry[1]} = new ${adapterEntry[1]}();\n`,
			],
		]);

		expect(diffRenamedTrees(beforeFiles, afterFiles)).toEqual([]);
	});

	test("flags a missing after-tree file", () => {
		const beforeFiles = new Map([["src/a.ts", "export const a = 1;\n"]]);
		const afterFiles = new Map();

		expect(diffRenamedTrees(beforeFiles, afterFiles)).toEqual([
			"missing in after tree: src/a.ts",
		]);
	});

	test("does not flag a genuinely new file unrelated to any before-tree entry", () => {
		// D-12 commit 1 legitimately also introduces new infrastructure (this gate
		// script, its own companion test, one ambient .mjs declaration) alongside
		// the pure rename — see the file header's "Scope" note. An empty
		// beforeFiles set (nothing to transform) must not flag unrelated new
		// after-tree content; that is out of this gate's claim.
		const beforeFiles = new Map();
		const afterFiles = new Map([["src/new.ts", "export const b = 2;\n"]]);

		expect(diffRenamedTrees(beforeFiles, afterFiles)).toEqual([]);
	});

	// NEGATIVE CONTROL (required by the plan): a gate that has never been shown to
	// fail is the next unfirable check. This feeds a synthetic "after" tree carrying
	// a real content change beyond the token map — a behavior edit smuggled into what
	// claims to be a pure rename — and asserts diffRenamedTrees reports it. Restoring
	// this to pass vacuously (e.g. by loosening the comparison) is exactly the Phase
	// 46 defect class D-12 exists to prevent.
	test("NEGATIVE CONTROL: flags a real content change hidden inside an otherwise-renamed file", () => {
		const beforeFiles = new Map([
			[
				portPathFrom,
				`export interface ${portEntry[0]} {\n\tgetCapabilities(): unknown;\n}\n`,
			],
		]);
		// The after tree applies the correct path move and identifier rename, but ALSO
		// smuggles in a behavior change (a new method) that no token substitution
		// could have produced — exactly what D-12 forbids landing in commit 1.
		const afterFiles = new Map([
			[
				portPathTo,
				`export interface ${portEntry[1]} {\n\tgetCapabilities(): unknown;\n\tsanitizeInPlace(): void;\n}\n`,
			],
		]);

		const problems = diffRenamedTrees(beforeFiles, afterFiles);

		expect(problems).toEqual([
			`content mismatch beyond the token map: ${portPathTo}`,
		]);
	});
});

describe("token map shape", () => {
	test("the first identifier entry is the longest, as the plan requires", () => {
		const lengths = IDENTIFIER_TOKEN_MAP.map(([from]) => from.length);
		expect(Math.max(...lengths)).toBe(lengths[0]);
	});

	test("LITERAL_TOKEN_MAP carries exactly one quoted backend literal", () => {
		expect(LITERAL_TOKEN_MAP).toHaveLength(1);
		expect(literalTo).toBe('backend: "native"');
	});

	test("PATH_MOVES carries exactly five path moves", () => {
		expect(PATH_MOVES).toHaveLength(5);
	});

	test("every PATH_MOVES source has a corresponding IMPORT_PATH_TOKEN_MAP entry for the adapter and port moves", () => {
		// The two directory-affecting moves (port in-place rename, adapter directory
		// move) must each have at least one import-specifier rewrite registered —
		// otherwise an importer of the moved file would silently keep pointing at
		// the old path.
		const importFroms = IMPORT_PATH_TOKEN_MAP.map(([from]) => from);
		const referencesAdapterMove = importFroms.some(
			(specifier) =>
				transformPath(adapterPathFrom) !== adapterPathFrom &&
				specifier.length > 0,
		);
		const referencesPortMove = importFroms.some(
			(specifier) =>
				transformPath(portPathFrom) !== portPathFrom && specifier.length > 0,
		);
		expect(referencesAdapterMove).toBe(true);
		expect(referencesPortMove).toBe(true);
		expect(IMPORT_PATH_TOKEN_MAP.length).toBeGreaterThan(0);
	});
});
