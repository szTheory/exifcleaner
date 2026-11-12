import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// D-03(c) / T-72-01: src/renderer/story_support holds test support (fixtures, the
// real-pointer helper) that lives in the production source tree (V3). Only story
// files and story_support itself may import it; `.storybook/` and `tests/` sit outside
// src/ and legitimately do, so this gate polices src/** only.
const SUPPORT_DIR = "src/renderer/story_support";

export function storySupportImportViolations(
	files: ReadonlyArray<{ path: string; text: string }>,
): string[] {
	const violations: string[] = [];
	for (const { path: file, text } of files) {
		if (!file.startsWith("src/")) continue;
		if (file.endsWith(".stories.tsx")) continue;
		if (file.startsWith(`${SUPPORT_DIR}/`)) continue;
		const specifiers = [
			...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
			...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
			...text.matchAll(/^import\s+["']([^"']+)["']/gm),
			...text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
		].map((match) => match[1] ?? "");
		for (const specifier of specifiers) {
			const resolved = specifier.startsWith(".")
				? path.posix.join(path.posix.dirname(file), specifier)
				: specifier;
			if (resolved === SUPPORT_DIR || resolved.startsWith(`${SUPPORT_DIR}/`)) {
				violations.push(
					`${file} imports ${specifier} (story support outside a story)`,
				);
			}
		}
	}
	return violations;
}

function walkTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const absolute = path.join(dir, name);
		if (statSync(absolute).isDirectory()) {
			out.push(...walkTsFiles(absolute));
			continue;
		}
		if (absolute.endsWith(".ts") || absolute.endsWith(".tsx")) {
			out.push(absolute);
		}
	}
	return out;
}

const PLANTED_TEXT =
	'import { fileEntry } from "../story_support/process_outcomes";';

describe("story_support importers (D-03)", () => {
	test("no src file other than a story or story_support itself imports story_support", () => {
		const root = path.resolve(import.meta.dirname, "..");
		const files = walkTsFiles(path.join(root, "src")).map((absolute) => ({
			path: path.relative(root, absolute).split(path.sep).join("/"),
			text: readFileSync(absolute, "utf8"),
		}));
		// Anti-vacuity: the walk saw production code, and a real story imports support.
		expect(files.length).toBeGreaterThan(50);
		const importers = files.filter(
			(file) =>
				file.path.endsWith(".stories.tsx") &&
				file.text.includes("story_support/"),
		);
		expect(importers.length).toBeGreaterThanOrEqual(1);
		expect(storySupportImportViolations(files)).toEqual([]);
	});

	test("a planted production file importing story_support yields exactly one violation", () => {
		expect(
			storySupportImportViolations([
				{ path: "src/renderer/components/x.tsx", text: PLANTED_TEXT },
			]),
		).toEqual([
			"src/renderer/components/x.tsx imports ../story_support/process_outcomes (story support outside a story)",
		]);
	});

	test("the dynamic, side-effect and require forms are each caught", () => {
		for (const text of [
			'const m = await import("../story_support/process_outcomes");',
			'import "../story_support/process_outcomes";',
			'const m = require("../story_support/process_outcomes");',
		]) {
			expect(
				storySupportImportViolations([
					{ path: "src/renderer/components/x.tsx", text },
				]),
				text,
			).toEqual([
				"src/renderer/components/x.tsx imports ../story_support/process_outcomes (story support outside a story)",
			]);
		}
	});

	test("stories, story_support itself and files outside src are allowed", () => {
		expect(
			storySupportImportViolations([
				{ path: "src/renderer/components/x.stories.tsx", text: PLANTED_TEXT },
				{
					path: "src/renderer/story_support/a.ts",
					text: 'import { fileEntry } from "./process_outcomes";',
				},
				{
					path: "src/renderer/story_support/b.ts",
					text: 'import { fileEntry } from "../story_support/process_outcomes";',
				},
				{
					path: "tests/renderer/x.test.ts",
					text: 'import { fileEntry } from "../../src/renderer/story_support/process_outcomes";',
				},
				{
					path: ".storybook/known_a11y_equivalence.test.ts",
					text: 'import { knownA11yFrom } from "../src/renderer/story_support/known_a11y";',
				},
			]),
		).toEqual([]);
	});

	test("an absolute-from-root specifier is caught too", () => {
		expect(
			storySupportImportViolations([
				{
					path: "src/main/x.ts",
					text: 'import { fileEntry } from "src/renderer/story_support/process_outcomes";',
				},
			]),
		).toEqual([
			"src/main/x.ts imports src/renderer/story_support/process_outcomes (story support outside a story)",
		]);
	});
});
