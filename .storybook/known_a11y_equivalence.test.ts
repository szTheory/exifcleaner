import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { knownA11yFrom as storySupportFrom } from "../src/renderer/story_support/known_a11y";
import { knownA11yFrom as storybookFrom } from "./a11y_known";

// C5: stories read the baseline through src/renderer/story_support/known_a11y.ts
// because src/ may not import .storybook/ (the D-03 isolation guard). The two
// copies of the pure body must stay equal; this is the test that says so.
type Doc = {
	entries: ReadonlyArray<{ kind: string; story: string; rule: string }>;
};

const baseline = JSON.parse(
	readFileSync(
		path.resolve(import.meta.dirname, "../docs/evidence/known-findings.json"),
		"utf8",
	),
) as Doc;

describe("story_support knownA11yFrom equals the .storybook copy (C5)", () => {
	test("for every story with a real baseline entry", () => {
		const stories = [...new Set(baseline.entries.map((entry) => entry.story))];
		for (const story of stories) {
			expect(storySupportFrom(baseline, story), story).toEqual(
				storybookFrom(baseline, story),
			);
			// Non-vacuity: an entry story is really excused.
			expect(storySupportFrom(baseline, story), story).not.toEqual({});
		}
	});

	test("for a story with no entry", () => {
		const id = "settings-toggleswitch--default";
		expect(storySupportFrom(baseline, id)).toEqual({});
		expect(storybookFrom(baseline, id)).toEqual({});
	});

	test("for a planted document mixing a11y, a11y-p72 and a non-a11y kind", () => {
		const planted: Doc = {
			entries: [
				{ kind: "a11y", story: "x--one", rule: "region" },
				{ kind: "a11y-p72", story: "x--one", rule: "color-contrast" },
				{ kind: "contrast", story: "x--one", rule: "label" },
				{ kind: "a11y-p72", story: "x--two", rule: "color-contrast" },
			],
		};
		const expected = {
			options: {
				rules: {
					region: { enabled: false },
					"color-contrast": { enabled: false },
				},
			},
		};
		expect(storySupportFrom(planted, "x--one")).toEqual(expected);
		expect(storybookFrom(planted, "x--one")).toEqual(expected);
		for (const story of ["x--one", "x--two", "x--none"]) {
			expect(storySupportFrom(planted, story), story).toEqual(
				storybookFrom(planted, story),
			);
		}
	});
});
