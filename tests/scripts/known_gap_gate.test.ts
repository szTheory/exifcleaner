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
	scanRunnerPolicy,
	validateKnownGapsManifest,
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

describe("scanRunnerPolicy", () => {
	const expectedTitle = "#304 save-as-copy on: original survives, a cleaned copy appears";

	test("inventories direct declaration-time Playwright and Vitest expected-failure markers", () => {
		const cases = [
			{
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
test.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
				type: "test.fail",
				runner: "playwright",
			},
			{
				file: "tests/application/example.test.ts",
				source: `import { test } from "vitest";
test.fails("${expectedTitle}", () => {
	expect(true).toBe(false);
});`,
				type: "test.fails",
				runner: "vitest",
			},
			{
				file: "tests/domain/example.test.ts",
				source: `import { it } from "vitest";
it.fails("${expectedTitle}", () => {
	expect(true).toBe(false);
});`,
				type: "it.fails",
				runner: "vitest",
			},
		] as const;

		const markers = cases.flatMap((entry) => {
			const result = scanRunnerPolicy(entry.source, entry.file);
			expect(result.problems).toEqual([]);
			return result.markers;
		});

		expect(markers).toEqual(
			cases.map((entry) => ({
				runner: entry.runner,
				type: entry.type,
				file: entry.file,
				title: expectedTitle,
				issue: 304,
			})),
		);
	});

	test("rejects malformed expected-failure markers and runner controls fail closed", () => {
		const forbiddenCases = [
			{
				code: "dynamic-title",
				source: `import { test } from "@playwright/test";
const title = "${expectedTitle}";
test.fail(title, async () => {});`,
			},
			{
				code: "wrapper-marker",
				source: `import { test } from "@playwright/test";
knownGap("${expectedTitle}", async () => {});`,
			},
			{
				code: "alias-marker",
				source: `import { test } from "@playwright/test";
const mark = test.fail;
mark("${expectedTitle}", async () => {});`,
			},
			{
				code: "computed-marker",
				source: `import { test } from "@playwright/test";
test["fail"]("${expectedTitle}", async () => {});`,
			},
			{
				code: "runtime-marker",
				source: `import { test } from "@playwright/test";
test("${expectedTitle}", async () => {
	test.fail(true, "platform-specific");
});`,
			},
			{
				code: "suite-marker",
				source: `import { test } from "@playwright/test";
test.describe("suite", () => {
	test.fail();
});`,
			},
			{
				code: "chained-marker",
				source: `import { test } from "@playwright/test";
test.fail.only("${expectedTitle}", async () => {});`,
			},
			{
				code: "disabled-test",
				source: `import { test } from "@playwright/test";
test.skip("covered behavior", async () => {});`,
			},
			{
				code: "focused-test",
				source: `import { test } from "vitest";
test.only("covered behavior", () => {});`,
			},
			{
				code: "conditional-control",
				source: `import { test } from "vitest";
test.skipIf(process.platform === "darwin")("covered behavior", () => {});`,
			},
			{
				code: "options-object-control",
				source: `import { test } from "vitest";
test("covered behavior", { only: true }, () => {});`,
			},
			{
				code: "step-skip",
				source: `import { test } from "@playwright/test";
test("covered behavior", async () => {
	await test.step("step", async (step) => step.skip());
});`,
			},
		] as const;

		const codes = forbiddenCases.flatMap((entry) =>
			scanRunnerPolicy(entry.source, "tests/e2e/settings.spec.ts").problems.map(
				(problem) => problem.code,
			),
		);

		expect(codes).toEqual(forbiddenCases.map((entry) => entry.code));
	});

	test("requires literal issue-linked marker titles", () => {
		const missingIssue = scanRunnerPolicy(
			`import { test } from "@playwright/test";
test.fail("save-as-copy on: original survives", async () => {});`,
			"tests/e2e/settings.spec.ts",
		);
		const nonLiteral = scanRunnerPolicy(
			`import { test } from "vitest";
test.fails(\`#304 ${"${"}String("save-as-copy")}\`, () => {});`,
			"tests/application/example.test.ts",
		);

		expect(missingIssue.problems.map((problem) => problem.code)).toEqual([
			"marker-title",
		]);
		expect(nonLiteral.problems.map((problem) => problem.code)).toEqual([
			"marker-title",
		]);
	});
});

describe("validateKnownGapsManifest", () => {
	const marker = {
		runner: "playwright",
		type: "test.fail",
		file: "tests/e2e/settings.spec.ts",
		title: "#304 save-as-copy on: original survives, a cleaned copy appears",
		issue: 304,
	} as const;
	const record = {
		id: "KG-304-save-as-copy",
		issue: 304,
		runner: marker.runner,
		type: marker.type,
		path: marker.file,
		title: marker.title,
		affectedScope: "save-as-copy cleaning writes the original file",
		releasePolicy: "block",
	} as const;
	const manifest = {
		schemaVersion: 1,
		targetVersion: "4.0.0",
		records: [record],
	} as const;
	const validate = (candidate: unknown, release = false) =>
		validateKnownGapsManifest(candidate, [marker], {
			packageVersion: "4.0.0",
			release,
		});
	const codesFor = (candidate: unknown, release = false) =>
		validate(candidate, release).problems.map((problem) => problem.code);

	test("accepts the exact reviewed #304 block record in normal mode", () => {
		expect(validate(manifest).problems).toEqual([]);
		expect(validate(manifest).records).toEqual([record]);
	});

	test("fails both source-to-manifest and manifest-to-source differences", () => {
		expect(codesFor({ ...manifest, records: [] })).toEqual([
			"missing-source-marker",
		]);
		expect(
			codesFor({
				...manifest,
				records: [{ ...record, title: "#999 stale marker" }],
			}),
		).toEqual(["stale-manifest-record", "missing-source-marker"]);
	});

	test("rejects duplicate, renamed, downgraded, unknown-field, and wildcard records", () => {
		const duplicateId = {
			...manifest,
			records: [{ ...record }, { ...record, path: "tests/e2e/other.spec.ts" }],
		};
		const duplicateIdentity = {
			...manifest,
			records: [{ ...record }, { ...record, id: "KG-304-copy" }],
		};
		const renamed = {
			...manifest,
			records: [{ ...record, id: "KG-304-renamed" }],
		};
		const downgraded = {
			...manifest,
			records: [{ ...record, releasePolicy: "allow" }],
		};
		const unknownField = {
			...manifest,
			records: [{ ...record, owner: "maintainer" }],
		};
		const wildcard = {
			...manifest,
			records: [{ ...record, path: "tests/e2e/*.spec.ts" }],
		};

		expect(codesFor(duplicateId)).toContain("duplicate-id");
		expect(codesFor(duplicateIdentity)).toContain("duplicate-identity");
		expect(codesFor(renamed)).toContain("stable-id");
		expect(codesFor(downgraded)).toContain("policy-downgrade");
		expect(codesFor(unknownField)).toContain("unknown-field");
		expect(codesFor(wildcard)).toContain("invalid-path");
	});

	test("release mode rejects target-version drift and every block record", () => {
		expect(
			codesFor({ ...manifest, targetVersion: "4.0.1" }, true),
		).toContain("target-version");
		expect(codesFor(manifest, true)).toContain("release-block");
	});

	test("allow records require disclosure fields with three-part target version", () => {
		const allowed = {
			...manifest,
			records: [
				{
					...record,
					id: "KG-304-allowed",
					releasePolicy: "allow",
					impact: "Users can identify the known limitation before release.",
					workaround: "Use overwrite mode only on disposable copies.",
					targetFixVersion: "4.0.1",
				},
			],
		};

		expect(codesFor({ ...allowed, records: [{ ...allowed.records[0], impact: "" }] })).toContain(
			"allow-disclosure",
		);
		expect(
			codesFor({
				...allowed,
				records: [{ ...allowed.records[0], targetFixVersion: "4.1" }],
			}),
		).toContain("allow-disclosure");
	});
});
