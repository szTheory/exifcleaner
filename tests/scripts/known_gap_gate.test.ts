import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { KnownGapProblem } from "../../scripts/known_gap_gate.mjs";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	BANNED_PROSE_PHRASES,
	buildKnownLimitationsBlock,
	collectTestSourceFiles,
	formatGitHubAnnotation,
	formatLiteralMarkerCounts,
	formatLocalDiagnostic,
	getLiteralMarkerCounts,
	scanBannedProse,
	scanCollectedTestSources,
	scanRunnerPolicy,
	validateKnownLimitationsBlock,
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

const expectNoVacuousGreen = (
	source: string,
	code: string,
	file = "tests/e2e/settings.spec.ts",
): void => {
	const result = scanRunnerPolicy(source, file);

	expect(result.markers).toEqual([]);
	expect(result.problems.length).toBeGreaterThan(0);
	expect(result.markers.length + result.problems.length).toBeGreaterThan(0);
	expect(result.problems.map((problem) => problem.code)).toContain(code);
};

const readRepoText = (relativePath: string): string =>
	readFileSync(path.join(process.cwd(), relativePath), "utf8");

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
			const before = snapshotDir(root);

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
			const after = snapshotDir(root);

			assertDirEffect(before, after, {
				added: [
					"docs",
					"docs/evidence",
					"docs/evidence/proof.test.ts",
					"tests",
					"tests/e2e",
					"tests/e2e/fixtures",
					"tests/e2e/fixtures/fixture_integrity.test.ts",
					"tests/e2e/helpers",
					"tests/e2e/helpers/helper.ts",
					"tests/e2e/settings.spec.ts",
					"tests/example.test.ts",
					"tests/smoke",
					"tests/smoke/app.smoke.ts",
				],
			});

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
			const beforeCleanFixture = snapshotDir(root);

			mkdirSync(path.join(root, "tests/e2e"), { recursive: true });
			writeFileSync(
				path.join(root, "tests/e2e/clean.spec.ts"),
				makeSource("covered by an executable marker"),
				"utf8",
			);
			const afterCleanFixture = snapshotDir(root);

			assertDirEffect(beforeCleanFixture, afterCleanFixture, {
				added: ["tests", "tests/e2e", "tests/e2e/clean.spec.ts"],
			});

			expect(scanCollectedTestSources(root)).toEqual([]);

			const beforeFreshViolation = snapshotDir(root);
			writeFileSync(
				path.join(root, "tests/e2e/fresh.spec.ts"),
				makeSource(phrase),
				"utf8",
			);
			const afterFreshViolation = snapshotDir(root);

			assertDirEffect(beforeFreshViolation, afterFreshViolation, {
				added: ["tests/e2e/fresh.spec.ts"],
				unchanged: ["tests/e2e/clean.spec.ts"],
			});

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
	const expectedTitle =
		"#304 save-as-copy on: original survives, a cleaned copy appears";

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
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
test.fail("${expectedTitle}", { tag: "@known-gap" }, function () {
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

	test("admits direct markers only from unshadowed runner imports", () => {
		const forbiddenCases = [
			{
				name: "no runner import",
				code: "untrusted-marker-receiver",
				file: "tests/e2e/settings.spec.ts",
				source: `const test = { fail() {} };
test.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "local fake receiver",
				code: "untrusted-marker-receiver",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test as runner } from "@playwright/test";
const test = { fail() {} };
test.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});
runner("covered behavior", async () => {
	expect(true).toBe(true);
});`,
			},
			{
				name: "block shadow",
				code: "untrusted-marker-receiver",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
{
	const test = { fail() {} };
	test.fail("${expectedTitle}", async () => {
		expect(true).toBe(false);
	});
}`,
			},
			{
				name: "parameter shadow",
				code: "untrusted-marker-receiver",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
function register(test: { fail(title: string, body: () => void): void }) {
	test.fail("${expectedTitle}", () => {
		expect(true).toBe(false);
	});
}`,
			},
			{
				name: "Playwright fails spelling",
				code: "untrusted-marker-receiver",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
test.fails("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "Vitest fail spelling",
				code: "untrusted-marker-receiver",
				file: "tests/domain/example.test.ts",
				source: `import { test } from "vitest";
test.fail("${expectedTitle}", () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "Vitest it.fail spelling",
				code: "untrusted-marker-receiver",
				file: "tests/domain/example.test.ts",
				source: `import { it } from "vitest";
it.fail("${expectedTitle}", () => {
	expect(true).toBe(false);
});`,
			},
		] as const;

		for (const entry of forbiddenCases) {
			const result = scanRunnerPolicy(entry.source, entry.file);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems.length, entry.name).toBeGreaterThan(0);
			expect(
				result.markers.length + result.problems.length,
				entry.name,
			).toBeGreaterThan(0);
			expect(
				result.problems.map((problem) => problem.code),
				entry.name,
			).toContain(entry.code);
		}
	});

	test("rejects expected-failure declarations without executable function bodies", () => {
		const cases = [
			{
				source: `import { test } from "@playwright/test";
test.fail("${expectedTitle}");`,
			},
			{
				source: `import { test } from "vitest";
test.fails("${expectedTitle}");`,
			},
			{
				source: `import { it } from "vitest";
it.fails("${expectedTitle}");`,
			},
			{
				source: `import { test } from "@playwright/test";
test.fail("${expectedTitle}", { tag: "@known-gap" });`,
			},
			{
				source: `import { test } from "vitest";
test.fails("${expectedTitle}", { retry: 0 }, () => {
	expect(true).toBe(false);
});`,
			},
		] as const;

		for (const entry of cases) {
			const result = scanRunnerPolicy(
				entry.source,
				"tests/e2e/settings.spec.ts",
			);

			expect(result.markers).toEqual([]);
			expect(result.problems.map((problem) => problem.code)).toEqual([
				"marker-body",
			]);
		}
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

	test("rejects Playwright suite controls from the leftmost runner receiver", () => {
		const forbiddenCases = [
			{
				name: "suite skip",
				code: "disabled-test",
				source: `import { test } from "@playwright/test";
test.describe.skip("covered suite", () => {
	test("covered behavior", async () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "suite only",
				code: "focused-test",
				source: `import { test } from "@playwright/test";
test.describe.only("covered suite", () => {
	test("covered behavior", async () => {
		expect(true).toBe(true);
	});
});`,
			},
		] as const;

		for (const entry of forbiddenCases) {
			const result = scanRunnerPolicy(
				entry.source,
				"tests/e2e/settings.spec.ts",
			);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems.length, entry.name).toBeGreaterThan(0);
			expect(
				result.markers.length + result.problems.length,
				entry.name,
			).toBeGreaterThan(0);
			expect(
				result.problems.map((problem) => problem.code),
				entry.name,
			).toContain(entry.code);
		}
	});

	test("rejects Vitest describe suite controls from trusted receivers", () => {
		const forbiddenCases = [
			{
				name: "canonical suite skip",
				code: "disabled-test",
				source: `import { describe } from "vitest";
describe.skip("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "canonical suite only",
				code: "focused-test",
				source: `import { describe } from "vitest";
describe.only("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "canonical conditional skip",
				code: "conditional-control",
				source: `import { describe } from "vitest";
describe.skipIf(process.platform === "darwin")("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "canonical conditional run",
				code: "conditional-control",
				source: `import { describe } from "vitest";
describe.runIf(process.platform === "darwin")("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "import-alias suite control",
				code: "disabled-test",
				source: `import { describe as suite } from "vitest";
suite.skip("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
			{
				name: "assignment-alias suite control",
				code: "focused-test",
				source: `import { describe } from "vitest";
const suite = describe;
suite.only("covered suite", () => {
	it("covered behavior", () => {
		expect(true).toBe(true);
	});
});`,
			},
		] as const;

		for (const entry of forbiddenCases) {
			const result = scanRunnerPolicy(
				entry.source,
				"tests/domain/example.test.ts",
			);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems.length, entry.name).toBeGreaterThan(0);
			expect(
				result.markers.length + result.problems.length,
				entry.name,
			).toBeGreaterThan(0);
			expect(
				result.problems.map((problem) => problem.code),
				entry.name,
			).toContain(entry.code);
		}
	});

	test("does not trust suite-control property chains on local receivers", () => {
		const controls = [
			{
				name: "local test receiver",
				source: `const test = {
	describe: {
		skip(_title: string, _body: () => void) {},
	},
};
test.describe.skip("covered suite", () => {});`,
			},
			{
				name: "local describe receiver",
				source: `const describe = {
	skip(_title: string, _body: () => void) {},
};
describe.skip("covered suite", () => {});`,
			},
			{
				name: "foreign describe import",
				source: `import { describe } from "not-a-runner";
describe.skip("covered suite", () => {});`,
			},
			{
				name: "shadowed Vitest describe receiver",
				source: `import { describe } from "vitest";
{
	const describe = {
		skip(_title: string, _body: () => void) {},
	};
	describe.skip("covered suite", () => {});
}`,
			},
		] as const;

		for (const entry of controls) {
			const result = scanRunnerPolicy(
				entry.source,
				"tests/domain/example.test.ts",
			);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems, entry.name).toEqual([]);
		}
	});

	test("rejects object-binding expected-failure aliases without inventorying markers", () => {
		const result = scanRunnerPolicy(
			`import { test } from "@playwright/test";
const { fail } = test;
fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			"tests/e2e/settings.spec.ts",
		);

		expect(result.markers).toEqual([]);
		expect(result.problems.map((problem) => problem.code)).toEqual([
			"alias-marker",
		]);
	});

	test("rejects computed-property expected-failure aliases without inventorying markers", () => {
		const result = scanRunnerPolicy(
			`import { test } from "@playwright/test";
const fail = test["fail"];
fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			"tests/e2e/settings.spec.ts",
		);

		expect(result.markers).toEqual([]);
		expect(result.problems.map((problem) => problem.code)).toEqual([
			"alias-marker",
		]);
	});

	test("rejects runner-object aliases without inventorying markers", () => {
		const forbiddenCases = [
			{
				name: "Playwright import alias",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test as pw } from "@playwright/test";
pw.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "Playwright assignment alias",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
const pw = test;
pw.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "Vitest it assignment alias",
				file: "tests/domain/example.test.ts",
				source: `import { it } from "vitest";
const spec = it;
spec.fails("${expectedTitle}", () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "transitive runner alias",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
const first = test;
const second = first;
const third = second;
third.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
			{
				name: "cycle-connected runner alias",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
let first = test;
let second = first;
first = second;
second.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});`,
			},
		] as const;

		for (const entry of forbiddenCases) {
			const result = scanRunnerPolicy(entry.source, entry.file);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems.length, entry.name).toBeGreaterThan(0);
			expect(
				result.markers.length + result.problems.length,
				entry.name,
			).toBeGreaterThan(0);
			expect(
				result.problems.map((problem) => problem.code),
				entry.name,
			).toContain("alias-marker");
		}
	});

	test("does not treat unrelated identifier cycles as runner aliases", () => {
		const result = scanRunnerPolicy(
			`import { test } from "@playwright/test";
let left = right;
let right = left;
left.fail("${expectedTitle}", async () => {
	expect(true).toBe(false);
});
test("covered behavior", async () => {
	expect(true).toBe(true);
});`,
			"tests/e2e/settings.spec.ts",
		);

		expect(result.markers).toEqual([]);
		expect(result.problems).toEqual([]);
	});

	test("rejects runner-control aliases with semantic policy problems", () => {
		const agendaControl = ["to", "do"].join("");
		const disabledControl = ["fix", "me"].join("");
		const forbiddenCases = [
			{
				name: "property skip",
				code: "disabled-test",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
const hidden = test.skip;
hidden("covered behavior", async () => {});`,
			},
			{
				name: "destructured disabled control",
				code: "disabled-test",
				file: "tests/e2e/settings.spec.ts",
				source: `import { test } from "@playwright/test";
const { ${disabledControl}: hidden } = test;
hidden("covered behavior", async () => {});`,
			},
			{
				name: "computed control",
				code: "disabled-test",
				source: `import { test } from "vitest";
const hidden = test["${agendaControl}"];
hidden("covered behavior", () => {});`,
				file: "tests/domain/example.test.ts",
			},
			{
				name: "transitive only",
				code: "focused-test",
				source: `import { test } from "vitest";
const first = test.only;
const second = first;
second("covered behavior", () => {});`,
				file: "tests/domain/example.test.ts",
			},
			{
				name: "cycle-connected skipIf",
				code: "conditional-control",
				source: `import { test } from "vitest";
let first = test.skipIf;
let second = first;
first = second;
second(process.platform === "darwin")("covered behavior", () => {});`,
				file: "tests/domain/example.test.ts",
			},
			{
				name: "runner alias runIf",
				code: "conditional-control",
				source: `import { test as base } from "vitest";
const spec = base;
spec["runIf"](process.platform === "darwin")("covered behavior", () => {});`,
				file: "tests/domain/example.test.ts",
			},
		] as const;

		for (const entry of forbiddenCases) {
			expectNoVacuousGreen(entry.source, entry.code, entry.file);
		}
	});

	test("keeps helper option data clean while runner options fail closed", () => {
		const helperResult = scanRunnerPolicy(
			`import { test } from "@playwright/test";
fixture({ skip: true });
test("covered behavior", async () => {
	expect(true).toBe(true);
});`,
			"tests/e2e/settings.spec.ts",
		);
		const helperCycleResult = scanRunnerPolicy(
			`import { test } from "@playwright/test";
let left = right;
let right = left;
left({ skip: true });
test("covered behavior", async () => {
	expect(true).toBe(true);
});`,
			"tests/e2e/settings.spec.ts",
		);

		expect(helperResult.markers).toEqual([]);
		expect(helperResult.problems).toEqual([]);
		expect(helperCycleResult.markers).toEqual([]);
		expect(helperCycleResult.problems).toEqual([]);
		expectNoVacuousGreen(
			`import { test } from "vitest";
test("covered behavior", { skip: true }, () => {});`,
			"options-object-control",
			"tests/domain/example.test.ts",
		);
		expectNoVacuousGreen(
			`import { test as base } from "vitest";
const spec = base;
spec("covered behavior", { only: true }, () => {});`,
			"options-object-control",
			"tests/domain/example.test.ts",
		);
	});

	test("classifies Vitest agenda and fails options without touching helper data", () => {
		const agendaControl = ["to", "do"].join("");
		const forbiddenCases = [
			{
				name: "canonical test agenda control",
				code: "disabled-test",
				source: `import { test } from "vitest";
test("covered behavior", { ${agendaControl}: true }, () => {});`,
			},
			{
				name: "canonical it agenda control string key",
				code: "disabled-test",
				source: `import { it } from "vitest";
it("covered behavior", { "${agendaControl}": true }, () => {});`,
			},
			{
				name: "canonical test fails",
				code: "options-object-marker",
				source: `import { test } from "vitest";
test("${expectedTitle}", { fails: true }, () => {});`,
			},
			{
				name: "canonical it fails string key",
				code: "options-object-marker",
				source: `import { it } from "vitest";
it("${expectedTitle}", { "fails": true }, () => {});`,
			},
			{
				name: "trusted runner alias agenda control",
				code: "disabled-test",
				source: `import { test as base } from "vitest";
const spec = base;
spec("covered behavior", { ${agendaControl}: true }, () => {});`,
			},
			{
				name: "trusted runner alias fails",
				code: "options-object-marker",
				source: `import { it as base } from "vitest";
const spec = base;
spec("${expectedTitle}", { fails: true }, () => {});`,
			},
			{
				name: "canonical test dynamic agenda control",
				code: "disabled-test",
				source: `import { test } from "vitest";
const disabled = true;
test("covered behavior", { ${agendaControl}: disabled }, () => {});`,
			},
			{
				name: "canonical it dynamic agenda string key",
				code: "disabled-test",
				source: `import { it } from "vitest";
const disabled = true;
it("covered behavior", { "${agendaControl}": disabled }, () => {});`,
			},
			{
				name: "canonical test dynamic fails",
				code: "options-object-marker",
				source: `import { test } from "vitest";
const expected = true;
test("${expectedTitle}", { fails: expected }, () => {});`,
			},
			{
				name: "canonical it dynamic fails string key",
				code: "options-object-marker",
				source: `import { it } from "vitest";
const expected = true;
it("${expectedTitle}", { "fails": expected }, () => {});`,
			},
			{
				name: "trusted runner alias dynamic agenda control",
				code: "disabled-test",
				source: `import { test as base } from "vitest";
const disabled = true;
const spec = base;
spec("covered behavior", { ${agendaControl}: disabled }, () => {});`,
			},
			{
				name: "trusted runner alias dynamic fails",
				code: "options-object-marker",
				source: `import { it as base } from "vitest";
const expected = true;
const spec = base;
spec("${expectedTitle}", { fails: expected }, () => {});`,
			},
		] as const;

		for (const entry of forbiddenCases) {
			const result = scanRunnerPolicy(
				entry.source,
				"tests/domain/example.test.ts",
			);

			expect(result.markers, entry.name).toEqual([]);
			expect(result.problems.length, entry.name).toBeGreaterThan(0);
			expect(
				result.markers.length + result.problems.length,
				entry.name,
			).toBeGreaterThan(0);
			expect(
				result.problems.map((problem) => problem.code),
				entry.name,
			).toContain(entry.code);
		}

		const falseValued = scanRunnerPolicy(
			`import { test } from "vitest";
test("covered behavior", { ${agendaControl}: false, fails: false }, () => {});`,
			"tests/domain/example.test.ts",
		);
		const falseValuedAlias = scanRunnerPolicy(
			`import { it as base } from "vitest";
const spec = base;
spec("covered behavior", { "${agendaControl}": false, "fails": false }, () => {});`,
			"tests/domain/example.test.ts",
		);
		const helper = scanRunnerPolicy(
			`import { test } from "vitest";
fixture({ ${agendaControl}: true, fails: true });
test("covered behavior", () => {});`,
			"tests/domain/example.test.ts",
		);
		const fakeReceiver = scanRunnerPolicy(
			`const test = (title: string, options: unknown, body: () => void) => {};
test("covered behavior", { ${agendaControl}: true, fails: true }, () => {});`,
			"tests/domain/example.test.ts",
		);

		expect(falseValued.markers).toEqual([]);
		expect(falseValued.problems).toEqual([]);
		expect(falseValuedAlias.markers).toEqual([]);
		expect(falseValuedAlias.problems).toEqual([]);
		expect(helper.markers).toEqual([]);
		expect(helper.problems).toEqual([]);
		expect(fakeReceiver.markers).toEqual([]);
		expect(fakeReceiver.problems).toEqual([]);
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

	test("accepts the reviewed #240 stable ID", () => {
		const issue240Marker = {
			runner: "playwright",
			type: "test.fail",
			file: "tests/e2e/oracle-accountability.spec.ts",
			title: "#240 stripped MP4 does not retain create-date metadata",
			issue: 240,
		} as const;
		const issue240Record = {
			id: "KG-240-mp4-create-dates",
			issue: 240,
			runner: issue240Marker.runner,
			type: issue240Marker.type,
			path: issue240Marker.file,
			title: issue240Marker.title,
			affectedScope: "MP4 create-date metadata can remain after stripping.",
			releasePolicy: "allow",
			impact: "A cleaned MP4 may still include original create-date metadata.",
			workaround:
				"Run ExifTool manually for the three create-date tags and verify the result.",
			targetFixVersion: "4.1.0",
		} as const;

		expect(
			validateKnownGapsManifest(
				{ ...manifest, records: [issue240Record] },
				[issue240Marker],
				{ packageVersion: "4.0.0", release: false },
			).problems,
		).toEqual([]);
	});

	test("release mode rejects target-version drift and every block record", () => {
		expect(codesFor({ ...manifest, targetVersion: "4.0.1" }, true)).toContain(
			"target-version",
		);
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

		expect(
			codesFor({
				...allowed,
				records: [{ ...allowed.records[0], impact: "" }],
			}),
		).toContain("allow-disclosure");
		expect(
			codesFor({
				...allowed,
				records: [{ ...allowed.records[0], targetFixVersion: "4.1" }],
			}),
		).toContain("allow-disclosure");
	});

	test("allow records cannot be used for mandatory block categories", () => {
		const allowedDataLoss = {
			...manifest,
			records: [
				{
					...record,
					releasePolicy: "allow",
					affectedScope: "data loss in the release path",
					impact: "Original files can be overwritten.",
					workaround: "None.",
					targetFixVersion: "4.0.1",
				},
			],
		};

		expect(codesFor(allowedDataLoss)).toContain("blocked-category");
	});
});

describe("release-note known limitations block", () => {
	const allowedRecord = {
		id: "KG-217-source-tag",
		issue: 217,
		runner: "playwright",
		type: "test.fail",
		path: "tests/e2e/metadata.spec.ts",
		title: "#217 stripped files do not retain Source metadata",
		affectedScope: "JPEG metadata stripping can leave the Source tag behind.",
		releasePolicy: "allow",
		impact: "A cleaned JPEG may still contain a non-sensitive Source tag.",
		workaround:
			"Remove the tag with ExifTool manually when that field matters.",
		targetFixVersion: "4.0.1",
	} as const;

	test("renders a versioned sentinel block for zero allowed records", () => {
		const block = buildKnownLimitationsBlock([], "4.0.0");

		expect(block).toContain("<!-- exifcleaner-known-limitations:start v1 -->");
		expect(block).toContain("## Known limitations in 4.0.0");
		expect(block).toContain(
			"No known limitations are approved for this release.",
		);
		expect(block).toContain("<!-- exifcleaner-known-limitations:end -->");
	});

	test("renders user-language allow records without marker titles or backend mechanics", () => {
		const block = buildKnownLimitationsBlock([allowedRecord], "4.0.0");

		expect(block).toContain(
			"Impact: A cleaned JPEG may still contain a non-sensitive Source tag.",
		);
		expect(block).toContain(
			"Scope: JPEG metadata stripping can leave the Source tag behind.",
		);
		expect(block).toContain(
			"Workaround: Remove the tag with ExifTool manually when that field matters.",
		);
		expect(block).toContain("Target fix: 4.0.1.");
		expect(block).toContain(
			"Issue: https://github.com/szTheory/exifcleaner/issues/217",
		);
		expect(block).not.toContain(allowedRecord.title);
		expect(block).not.toContain(allowedRecord.path);
		expect(block).not.toContain(allowedRecord.type);
	});

	test("detects a tampered managed release-note block", () => {
		const expected = buildKnownLimitationsBlock([allowedRecord], "4.0.0");
		const tampered = expected.replace(
			"Target fix: 4.0.1.",
			"Target fix: later.",
		);

		expect(
			validateKnownLimitationsBlock(expected, [allowedRecord], "4.0.0"),
		).toEqual([]);
		expect(
			validateKnownLimitationsBlock(tampered, [allowedRecord], "4.0.0"),
		).toEqual([
			{
				code: "release-notes-drift",
				message:
					"RELEASE_NOTES.md known limitations block is not current. Run yarn known-gaps:write.",
			},
		]);
	});
});

describe("release marker count evidence", () => {
	test("counts the four literal marker strings for release output", () => {
		const disabledMarker = `test.${["fix", "me("].join("")}`;
		const counts = getLiteralMarkerCounts([
			'test.fail("issue", async () => {}); test.fail("issue 2", async () => {});',
			`it.fails("issue", () => {}); test.skip("omitted", () => {}); ${disabledMarker}"future", () => {});`,
		]);

		expect(formatLiteralMarkerCounts(counts)).toEqual([
			"test.fail(: 2",
			"it.fails(: 1",
			"test.skip(: 1",
			`${disabledMarker}: 1`,
		]);
	});
});

describe("release workflow enforcement", () => {
	test("runs the composed release gate before expensive release work", () => {
		const workflow = readRepoText(".github/workflows/release.yml");
		const runLines = workflow
			.split("\n")
			.map((line, index) => ({ index, text: line.trim() }));
		const releaseGateRuns = runLines.filter(
			(line) => line.text === "run: yarn verify:release",
		);
		const installIndex = runLines.findIndex(
			(line) => line.text === "run: yarn install --frozen-lockfile",
		);
		const gateIndex = releaseGateRuns[0]?.index ?? -1;
		const lintIndex = runLines.findIndex(
			(line) => line.text === "run: yarn lint",
		);
		const compileIndex = runLines.findIndex(
			(line) => line.text === "run: yarn compile",
		);

		expect(releaseGateRuns).toHaveLength(1);
		expect(installIndex).toBeGreaterThanOrEqual(0);
		expect(gateIndex).toBeGreaterThan(installIndex);
		expect(gateIndex).toBeLessThan(lintIndex);
		expect(gateIndex).toBeLessThan(compileIndex);
		expect(workflow).toMatch(/build-macos:[\s\S]*?needs: test/);
		expect(workflow).toMatch(/build-windows:[\s\S]*?needs: test/);
		expect(workflow).toMatch(/build-linux:[\s\S]*?needs: test/);
	});

	test("traces verify:release through the managed release-note checker", () => {
		const packageJson = JSON.parse(readRepoText("package.json")) as {
			scripts?: Record<string, string>;
		};
		const scripts = packageJson.scripts ?? {};
		const verifyRelease = scripts["verify:release"];
		const knownGapsCheck = scripts["known-gaps:check"];

		if (typeof verifyRelease !== "string") {
			throw new Error("package.json scripts.verify:release must be a string");
		}
		if (typeof knownGapsCheck !== "string") {
			throw new Error("package.json scripts.known-gaps:check must be a string");
		}

		const releaseCommands = verifyRelease
			.split("&&")
			.map((command) => command.trim());
		expect(releaseCommands.slice(0, 2)).toEqual([
			"yarn verify:known-gaps --release",
			"yarn known-gaps:check",
		]);
		expect(knownGapsCheck).toBe(
			"node scripts/known_gap_gate.mjs --check-release-notes",
		);
	});
});
