import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { KnownGapProblem } from "../../scripts/known_gap_gate.mjs";
import {
	BANNED_PROSE_PHRASES,
	collectTestSourceFiles,
	formatGitHubAnnotation,
	formatLocalDiagnostic,
	scanBannedProse,
	scanCollectedTestSources,
} from "../../scripts/known_gap_gate.mjs";

const makeSource = (phrase: string): string =>
	[
		'import { test, expect } from "@playwright/test";',
		'test("records a known issue", async () => {',
		`  // ${phrase}`,
		"  expect(true).toBe(true);",
		"});",
	].join("\n");

const phraseAt = (index: number): string => {
	const phrase = BANNED_PROSE_PHRASES[index];
	if (phrase === undefined) {
		throw new Error(`missing banned phrase fixture at index ${index}`);
	}
	return phrase;
};

const onlyProblem = (problems: readonly KnownGapProblem[]): KnownGapProblem => {
	const problem = problems[0];
	if (problem === undefined) {
		throw new Error("expected one known-gap gate problem");
	}
	return problem;
};

describe("scanBannedProse", () => {
	test("reports every locked phrase without embedding policy text in this test file", () => {
		const problems = BANNED_PROSE_PHRASES.flatMap((phrase) =>
			scanBannedProse(makeSource(phrase), "tests/e2e/settings.spec.ts"),
		);

		expect(problems.map((problem) => problem.phrase)).toEqual(
			BANNED_PROSE_PHRASES,
		);
		expect(problems).toHaveLength(7);
	});

	test("reports a collected-source phrase with normalized path and line metadata", () => {
		const phrase = phraseAt(0);
		const problems = scanBannedProse(
			makeSource(phrase),
			"tests\\e2e\\settings.spec.ts",
		);

		expect(problems).toEqual([
			{
				file: "tests/e2e/settings.spec.ts",
				line: 3,
				phrase,
				message:
					"Move this known gap into a declaration-time expected-failure marker.",
			},
		]);
	});

	test("matches phrase casing independent of source casing", () => {
		const phrase = phraseAt(0);
		const problems = scanBannedProse(
			makeSource(phrase.toLocaleUpperCase("en-US")),
			"tests/example.test.ts",
		);

		expect(problems.map((problem) => problem.phrase)).toEqual([phrase]);
	});

	test("returns no problems for a source without policy prose", () => {
		const source = [
			'import { test, expect } from "vitest";',
			'test("uses executable coverage", () => {',
			"  expect(true).toBe(true);",
			"});",
		].join("\n");

		expect(scanBannedProse(source, "tests/example.test.ts")).toEqual([]);
	});

	test("sorts multiple matches by normalized path, then line, then phrase", () => {
		const firstPhrase = phraseAt(0);
		const secondPhrase = phraseAt(1);
		const thirdPhrase = phraseAt(2);
		const left = scanBannedProse(
			[
				'import { test } from "vitest";',
				`// ${thirdPhrase}`,
				`// ${secondPhrase}`,
			].join("\n"),
			"tests\\zeta.test.ts",
		);
		const right = scanBannedProse(
			[`// ${firstPhrase}`, `// ${secondPhrase}`].join("\n"),
			"tests/alpha.test.ts",
		);

		const sorted = [...left, ...right].sort((a, b) => {
			const fileOrder = a.file.localeCompare(b.file);
			if (fileOrder !== 0) {
				return fileOrder;
			}
			const lineOrder = a.line - b.line;
			if (lineOrder !== 0) {
				return lineOrder;
			}
			return a.phrase.localeCompare(b.phrase);
		});

		expect(sorted.map((problem) => `${problem.file}:${problem.line}`)).toEqual([
			"tests/alpha.test.ts:1",
			"tests/alpha.test.ts:2",
			"tests/zeta.test.ts:2",
			"tests/zeta.test.ts:3",
		]);
	});

	test("ignores source outside the collected test boundary", () => {
		const phrase = phraseAt(0);

		expect(
			scanBannedProse(makeSource(phrase), "tests/e2e/helpers/example.ts"),
		).toEqual([]);
		expect(
			scanBannedProse(makeSource(phrase), "tests/e2e/fixtures/example.test.ts"),
		).toEqual([]);
		expect(
			scanBannedProse(makeSource(phrase), "docs/evidence/example.md"),
		).toEqual([]);
	});
});

describe("collectTestSourceFiles", () => {
	test("collects only runner-owned test source paths", () => {
		const root = mkdtempSync(path.join(tmpdir(), "known-gap-gate-"));
		try {
			mkdirSync(path.join(root, "docs/evidence"), { recursive: true });
			mkdirSync(path.join(root, "tests/e2e/helpers"), { recursive: true });
			mkdirSync(path.join(root, "tests/e2e/fixtures"), { recursive: true });
			mkdirSync(path.join(root, "tests/smoke"), { recursive: true });
			writeFileSync(path.join(root, "tests/example.test.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/e2e/settings.spec.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/smoke/app.smoke.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/e2e/helpers/helper.ts"), "", "utf8");
			writeFileSync(
				path.join(root, "tests/e2e/fixtures/fixture_integrity.test.ts"),
				"",
				"utf8",
			);
			writeFileSync(path.join(root, "docs/evidence/proof.test.ts"), "", "utf8");

			expect(collectTestSourceFiles(root)).toEqual([
				"tests/e2e/settings.spec.ts",
				"tests/example.test.ts",
				"tests/smoke/app.smoke.ts",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("scanCollectedTestSources", () => {
	test("finished-tree negative control fails an injected subject while a clean subject passes", () => {
		const phrase = phraseAt(0);
		const root = mkdtempSync(path.join(tmpdir(), "known-gap-negative-"));
		try {
			mkdirSync(path.join(root, "tests/e2e"), { recursive: true });
			writeFileSync(
				path.join(root, "tests/e2e/clean.spec.ts"),
				makeSource("covered by an executable marker"),
				"utf8",
			);

			expect(scanCollectedTestSources(root)).toEqual([]);

			writeFileSync(
				path.join(root, "tests/e2e/fresh.spec.ts"),
				makeSource(phrase),
				"utf8",
			);

			const problems = scanCollectedTestSources(root);
			expect(problems).toHaveLength(1);
			const problem = onlyProblem(problems);
			expect(problem.file).toBe("tests/e2e/fresh.spec.ts");
			expect(problem.phrase).toBe(phrase);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("diagnostic formatting", () => {
	test("formats local and GitHub diagnostics with escaped workflow-command fields", () => {
		const phrase = phraseAt(0);
		const problem = onlyProblem(
			scanBannedProse(makeSource(phrase), "tests/e2e/weird:path,spec.spec.ts"),
		);

		expect(formatLocalDiagnostic(problem)).toContain(
			"tests/e2e/weird:path,spec.spec.ts:3",
		);
		expect(formatGitHubAnnotation(problem)).toContain(
			"file=tests/e2e/weird%3Apath%2Cspec.spec.ts,line=3",
		);
	});
});
