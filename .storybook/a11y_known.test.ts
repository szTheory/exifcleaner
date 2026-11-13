import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { validateBaseline } from "../scripts/findings_ratchet.mjs";
import { knownA11y, knownA11yFrom } from "./a11y_known";

const STORY = "settings-toggleswitch--default";

function entry(kind: string, story: string, rule: string) {
	return { kind, story, rule };
}

describe("checked-in findings baseline (D-29)", () => {
	const file = path.resolve(
		import.meta.dirname,
		"../docs/evidence/known-findings.json",
	);
	const text = readFileSync(file, "utf8");

	test("is valid, keeps the sealed a11y kind empty, and seals a11y-p72 (D-19, D-20)", () => {
		const parsed = JSON.parse(text) as {
			schemaVersion: number;
			kinds: Record<string, { sealed?: boolean }>;
			entries: Array<{ kind: string }>;
		};
		expect(validateBaseline(parsed)).toEqual([]);
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.kinds["a11y"]).toEqual({ sealed: true });
		expect(parsed.kinds["a11y-p72"]).toEqual({ sealed: true });
		// Nothing is ever added to the a11y kind; the Phase 72 entries are all a11y-p72
		// (later phases add their own kinds, so only the a11y kind is pinned empty).
		expect(parsed.entries.filter((entry) => entry.kind === "a11y")).toEqual([]);
	});

	test("is serialized tab-indented with a trailing newline", () => {
		expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, "\t")}\n`);
	});
});

describe("knownA11yFrom (D-27)", () => {
	test("disables each baselined rule for that story only", () => {
		const baseline = {
			entries: [
				entry("a11y", STORY, "color-contrast"),
				entry("a11y-phase72", STORY, "label"),
				entry("a11y", "other--story", "region"),
			],
		};
		expect(knownA11yFrom(baseline, STORY)).toEqual({
			options: {
				rules: {
					"color-contrast": { enabled: false },
					label: { enabled: false },
				},
			},
		});
		expect(knownA11yFrom(baseline, "unlisted--story")).toEqual({});
	});

	test("ignores entries of a kind that is not an a11y kind", () => {
		const baseline = { entries: [entry("finding", STORY, "color-contrast")] };
		expect(knownA11yFrom(baseline, STORY)).toEqual({});
	});

	test("a story with no baseline entry is not excused (ToggleSwitch has no export named Default)", () => {
		expect(knownA11y(STORY)).toEqual({});
	});
});
