// The catalog tests may never be silently switched off. scripts/known_gap_gate.mjs
// forbids these runner controls under tests/ only, and .storybook/** is outside
// its walk, so this scan holds the same rule here (T-71-21). The control names
// are built from fragments so this file does not match itself.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "./temp_repo";

const RUNNERS = ["te" + "st", "i" + "t", "des" + "cribe", "su" + "ite"];
const CONTROLS = [
	"sk" + "ip",
	"on" + "ly",
	"to" + "do",
	"fix" + "me",
	"skip" + "If",
	"run" + "If",
	"fa" + "ils",
];
const PREFIXED = ["x" + "test", "x" + "it", "x" + "describe", "f" + "it"];

const CALL = new RegExp(
	`\\b(?:${RUNNERS.join("|")})\\s*\\.\\s*(?:${CONTROLS.join("|")})\\b|\\b(?:${PREFIXED.join("|")})\\s*\\(`,
	"g",
);

function disabledControls(source: string): string[] {
	return [...source.matchAll(CALL)].map((match) => match[0]);
}

function walkTests(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const child = path.join(dir, entry.name);
		if (entry.isDirectory()) return walkTests(child);
		return /\.test\.tsx?$/.test(entry.name) ? [child] : [];
	});
}

describe("no skipped catalog tests", () => {
	test("no .storybook test file has a skipped, focused, todo, fixme or conditional call", () => {
		const self = path.join(repoRoot, ".storybook/catalog/no_skip.test.ts");
		const files = walkTests(path.join(repoRoot, ".storybook")).filter(
			(file) => file !== self,
		);
		// Anti-vacuity: the walk really saw the catalog and harness tests.
		expect(files.length).toBeGreaterThanOrEqual(15);
		const hits = files.flatMap((file) =>
			disabledControls(fs.readFileSync(file, "utf8")).map(
				(match) => `${path.relative(repoRoot, file)}: ${match}`,
			),
		);
		expect(hits).toEqual([]);
	});

	test("shown red: planted skipped test", () => {
		const planted = `${RUNNERS[0]}.${CONTROLS[0]}("x", () => {});\n`;
		expect(disabledControls(planted)).toEqual([`${RUNNERS[0]}.${CONTROLS[0]}`]);
	});

	test.each([
		["a focused describe", `${RUNNERS[2]}.${CONTROLS[1]}("x", () => {});`],
		["a todo", `${RUNNERS[1]}.${CONTROLS[2]}("x");`],
		["a fixme", `${RUNNERS[0]}.${CONTROLS[3]}("x", () => {});`],
		["a conditional", `${RUNNERS[0]}.${CONTROLS[4]}(true)("x", () => {});`],
		["a prefixed disable", `${PREFIXED[0]}("x", () => {});`],
	])("shown red: %s is reported", (_name, planted) => {
		expect(disabledControls(planted)).toHaveLength(1);
	});

	test("an ordinary test call is not reported", () => {
		expect(disabledControls(`${RUNNERS[0]}("x", () => {});\n`)).toEqual([]);
	});
});
