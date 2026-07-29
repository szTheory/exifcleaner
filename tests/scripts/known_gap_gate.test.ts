import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	BANNED_PROSE_PHRASES,
	collectTestSourceFiles,
	scanBannedProse,
} from "../../scripts/known_gap_gate.mjs";

const makeSource = (phrase: string): string =>
	[
		'import { test, expect } from "@playwright/test";',
		'test("records a known issue", async () => {',
		`  // ${phrase}`,
		"  expect(true).toBe(true);",
		"});",
	].join("\n");

describe("scanBannedProse", () => {
	test("reports a collected-source phrase with normalized path and line metadata", () => {
		const [phrase] = BANNED_PROSE_PHRASES;
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

	test("ignores source outside the collected test boundary", () => {
		const [phrase] = BANNED_PROSE_PHRASES;

		expect(
			scanBannedProse(makeSource(phrase), "tests/e2e/helpers/example.ts"),
		).toEqual([]);
	});
});

describe("collectTestSourceFiles", () => {
	test("collects only runner-owned test source paths", () => {
		const root = mkdtempSync(path.join(tmpdir(), "known-gap-gate-"));
		try {
			mkdirSync(path.join(root, "tests/e2e/helpers"), { recursive: true });
			mkdirSync(path.join(root, "tests/smoke"), { recursive: true });
			writeFileSync(path.join(root, "tests/example.test.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/e2e/settings.spec.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/smoke/app.smoke.ts"), "", "utf8");
			writeFileSync(path.join(root, "tests/e2e/helpers/helper.ts"), "", "utf8");

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
