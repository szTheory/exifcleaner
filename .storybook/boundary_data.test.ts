import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { FileProcessingStatus } from "../src/domain";
import {
	LONG_UNBROKEN_NAME,
	RLO_NAME,
	batch,
} from "../src/renderer/story_support/boundary_data";
import { repoRoot } from "./catalog/temp_repo";

// D-17 / STY-03: the boundary fixtures are pure and only describe rows the real pipeline
// can produce. The stories assert rendered text; this file asserts the data itself.
describe("boundary_data batch(count)", () => {
	test("batch(6) has six rows with distinct ids and paths", () => {
		const rows = batch(6);
		expect(rows).toHaveLength(6);
		expect(new Set(rows.map((row) => row.id)).size).toBe(6);
		expect(new Set(rows.map((row) => row.path)).size).toBe(6);
	});

	test("batch(0) is empty and two calls are deep-equal (no random source, no clock)", () => {
		expect(batch(0)).toEqual([]);
		expect(batch(6)).toEqual(batch(6));
	});

	test("every Complete row carries the cleaned fold, every other row is Pending or Processing", () => {
		const rows = batch(6);
		for (const row of rows) {
			if (row.status === FileProcessingStatus.Complete) {
				expect(row.outcomeKind).toBe("cleaned");
				expect(row.beforeTags).not.toBeNull();
				expect(row.afterTags).not.toBeNull();
			} else {
				expect([
					FileProcessingStatus.Pending,
					FileProcessingStatus.Processing,
				]).toContain(row.status);
				expect(row.outcomeKind).toBeUndefined();
			}
		}
		// Anti-vacuity: the batch really mixes the three states.
		expect(new Set(rows.map((row) => row.status)).size).toBe(3);
	});

	test("sizes stay inside uint32 and differ by row", () => {
		const sizes = batch(40).map((row) => row.size);
		expect(sizes.every((size) => size >= 0 && size <= 0xffffffff)).toBe(true);
		expect(new Set(sizes).size).toBeGreaterThan(30);
	});
});

describe("boundary_data names (T-73-05 Trojan Source)", () => {
	test("the long name is 180 code units and the RLO name holds the override", () => {
		expect(LONG_UNBROKEN_NAME).toHaveLength(180);
		expect(RLO_NAME).toContain("\u202E");
	});

	test("no raw bidirectional control character sits in the fixture source", () => {
		const source = readFileSync(
			path.join(repoRoot, "src/renderer/story_support/boundary_data.ts"),
			"utf8",
		);
		expect(source).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
		// The escape form is present, so the scan above is not vacuous.
		expect(source).toContain("\\u202E");
	});
});

// 73-fix WR-03: the phase rule (boundary_data.ts) is that every invisible or bidi
// character in a story, its support data or a Storybook test is written as an escape,
// so a reviewer reads it in a diff and a formatter cannot rewrite it. The check above
// covers one file; this one covers the whole Phase 73 scope. Visible punctuation
// (a curly quote, an ellipsis, a dash) stays legal.
//   - bidi controls: U+061C, U+200E-U+200F, U+202A-U+202E, U+2066-U+2069
//   - invisible: NBSP, soft hyphen, zero-width characters, word joiner, BOM
const INVISIBLE =
	/[\u00A0\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu;

// The NBSP normalisers: copy_lint.mjs and glossary.mjs map U+00A0 to a space and their
// tests feed it in, so the raw character is the subject under test. Only NBSP is exempt,
// and only here; every other invisible or bidi character is rejected in these files too.
const RAW_NBSP_SUBJECT = new Set([
	".storybook/catalog/copy_lint.mjs",
	".storybook/catalog/copy_lint.test.ts",
	".storybook/catalog/glossary.mjs",
]);

type SourceFile = { path: string; text: string };

function inInvisibleScope(file: string): boolean {
	return (
		(file.startsWith("src/renderer/") && file.endsWith(".stories.tsx")) ||
		/^src\/renderer\/story_support\/[^/]+\.ts$/.test(file) ||
		(file.startsWith(".storybook/") && /\.(ts|tsx|mjs)$/.test(file))
	);
}

// Every in-scope file under `root`, paths relative to it with forward slashes.
function scopeFiles(root: string): SourceFile[] {
	const walk = (relative: string): string[] => {
		if (!existsSync(path.join(root, relative))) return [];
		return readdirSync(path.join(root, relative), {
			withFileTypes: true,
		}).flatMap((entry) => {
			const child = `${relative}/${entry.name}`;
			if (entry.isDirectory()) {
				return entry.name === "node_modules" ? [] : walk(child);
			}
			return inInvisibleScope(child) ? [child] : [];
		});
	};
	return [...walk("src/renderer"), ...walk(".storybook")].map((file) => ({
		path: file,
		text: readFileSync(path.join(root, file), "utf8"),
	}));
}

function invisibleViolations(files: ReadonlyArray<SourceFile>): string[] {
	return files.flatMap(({ path: file, text }) =>
		text.split("\n").flatMap((line, index) =>
			[...line.matchAll(INVISIBLE)]
				.filter(
					(match) => !(match[0] === "\u00A0" && RAW_NBSP_SUBJECT.has(file)),
				)
				.map((match) => {
					const code = (match[0].codePointAt(0) ?? 0).toString(16);
					return `${file}:${index + 1} U+${code.toUpperCase().padStart(4, "0")}`;
				}),
		),
	);
}

describe("invisible and bidi characters are escapes across the Phase 73 scope (T-73-05, WR-03)", () => {
	test("no story, story-support or Storybook file holds a raw bidi control or invisible character", () => {
		const files = scopeFiles(repoRoot);
		const seen = files.map((file) => file.path);
		// Anti-vacuity: the walk reaches each part of the scope, including the file
		// that carried the raw NBSP and this one.
		expect(files.length).toBeGreaterThan(50);
		for (const expected of [
			"src/renderer/components/ui/EmptyState.stories.tsx",
			"src/renderer/components/screens/App.stories.tsx",
			"src/renderer/story_support/boundary_data.ts",
			".storybook/boundary_data.test.ts",
			".storybook/catalog/journeys.mjs",
		]) {
			expect(seen, expected).toContain(expected);
		}
		expect(invisibleViolations(files)).toEqual([]);
	});

	test("the NBSP exemption is live: each allowed file still holds a raw NBSP, so none is a dead entry", () => {
		for (const file of RAW_NBSP_SUBJECT) {
			expect(
				readFileSync(path.join(repoRoot, file), "utf8").includes("\u00A0"),
				file,
			).toBe(true);
		}
	});

	test("planted files: a raw bidi control, NBSP, zero-width space and BOM in scope are each reported, with file and line", () => {
		// realpath: os.tmpdir() is itself a symlink on macOS (/var -> /private/var).
		const root = realpathSync(
			mkdtempSync(path.join(os.tmpdir(), "invisible-")),
		);
		try {
			const plant = (relative: string, text: string) => {
				mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
				writeFileSync(path.join(root, relative), text);
			};
			plant(
				"src/renderer/components/x/Planted.stories.tsx",
				'const a = 1;\nconst name = "pdf\u202Egnp.exe";\n',
			);
			plant(
				"src/renderer/story_support/planted.ts",
				'export const v = "a\u200Bb";\n',
			);
			plant(".storybook/planted.test.ts", 'expect(x).toBe("\u00A0");\n');
			plant(".storybook/planted/deep.mjs", "\uFEFFexport {};\n");
			// Out of scope: a production file and a non-story renderer file are not read.
			plant("src/main/outside.ts", '"\u202E"\n');
			plant("src/renderer/components/x/Component.tsx", '"\u00A0"\n');
			expect(invisibleViolations(scopeFiles(root)).sort()).toEqual([
				".storybook/planted.test.ts:1 U+00A0",
				".storybook/planted/deep.mjs:1 U+FEFF",
				"src/renderer/components/x/Planted.stories.tsx:2 U+202E",
				"src/renderer/story_support/planted.ts:1 U+200B",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("the NBSP exemption covers NBSP only, and only in the named files", () => {
		const nbsp = "\u00A0";
		const rlo = "\u202E";
		expect(
			invisibleViolations([
				{ path: ".storybook/catalog/glossary.mjs", text: `a${nbsp}b\n` },
			]),
		).toEqual([]);
		expect(
			invisibleViolations([
				{ path: ".storybook/catalog/glossary.mjs", text: `a${rlo}b\n` },
				{ path: ".storybook/catalog/other.mjs", text: `a${nbsp}b\n` },
			]),
		).toEqual([
			".storybook/catalog/glossary.mjs:1 U+202E",
			".storybook/catalog/other.mjs:1 U+00A0",
		]);
	});

	test("every bidi formatting control and the escape-visible punctuation are classified correctly", () => {
		for (const bidi of [
			"\u061C",
			"\u200E",
			"\u200F",
			"\u202A",
			"\u202B",
			"\u202C",
			"\u202D",
			"\u202E",
			"\u2066",
			"\u2067",
			"\u2068",
			"\u2069",
		]) {
			expect(
				invisibleViolations([{ path: ".storybook/x.ts", text: `a${bidi}b` }]),
				bidi.codePointAt(0)?.toString(16),
			).toHaveLength(1);
		}
		// Visible punctuation stays legal.
		expect(
			invisibleViolations([
				{ path: ".storybook/x.ts", text: "\u2019 \u2026 \u00B7 \u2014 \u00E9" },
			]),
		).toEqual([]);
	});
});
