import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import baseline from "../../docs/evidence/known-findings.json";
import copyFindings from "./copy-findings.json";
import {
	renderFindings,
	type FindingsViewEntry,
	type FindingsViewVerdict,
} from "./findings_view.mjs";
import { repoRoot } from "./temp_repo";

// FLW-02 / D-30 / R-3: FINDINGS.md is generated from the findings baseline and the
// copy-findings ratchet. Each section is shown on planted documents, and the output
// is checked for the properties every generated catalog file has (byte stability, no
// carriage return, one trailing newline) plus order independence.

function entry(
	kind: string,
	story: string,
	rule: string,
	patch: Partial<FindingsViewEntry> = {},
): FindingsViewEntry {
	return {
		fingerprint: `${kind}|${story}|${rule}`,
		kind,
		story,
		rule,
		reason: "planted for a test",
		disposition: "fix-v5.1",
		...patch,
	};
}

function verdict(of: FindingsViewEntry): FindingsViewVerdict {
	return {
		fingerprint: of.fingerprint,
		verdict: "reject",
		reason: "a catalog artefact, not a defect",
		decidedAt: "2026-11-13",
		decidedBy: "maintainer",
		reply: "agreed: leave it listed and quiet",
	};
}

const REGISTER = entry("silent-failure", "ui-toast--error", "no-announcement", {
	severity: "critical",
	reason: "The toast shows a failure but nothing announces it.",
});
const REJECTED = entry(
	"layout-gap",
	"file-list-filerow--cleaned",
	"hover-motion",
	{
		severity: "minor",
		disposition: "reject",
		reason: "Reduced motion already turns the transition off.",
	},
);
const AXE_A = entry("a11y-p72", "ui-a--one", "color-contrast");
const AXE_B = entry("a11y-p72", "ui-a--two", "color-contrast");
const AXE_C = entry("a11y-p73", "ui-b--one", "aria-conditional-attr", {
	disposition: "fix-v5.2",
});
const COPY = [
	{ fingerprint: "hardcoded|src:src/x.tsx|Try again", disposition: "fix-v5.1" },
	{ fingerprint: "hardcoded|src:src/a.tsx|Close", disposition: "accept" },
];

const PLANTED = {
	baseline: {
		entries: [REGISTER, REJECTED, AXE_A, AXE_B, AXE_C],
		verdicts: [verdict(REJECTED)],
	},
	copyFindings: { entries: COPY },
};

function section(text: string, heading: string): string {
	const start = text.indexOf(`## ${heading}`);
	if (start < 0) throw new Error(`no section ${heading}`);
	const next = text.indexOf("\n## ", start + 1);
	return text.slice(start, next < 0 ? undefined : next);
}

describe("renderFindings sections (planted documents)", () => {
	const text = renderFindings(PLANTED);

	test("starts with the generated-file header and the title", () => {
		const [header, blank, title] = text.split("\n");
		expect(header).toBe(
			"<!-- Generated from docs/evidence/known-findings.json and .storybook/catalog/copy-findings.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->",
		);
		expect(blank).toBe("");
		expect(title).toBe("# Findings register");
	});

	test("a register entry is printed in full: fingerprint, story, severity, disposition, reason", () => {
		const register = section(text, "Register");
		expect(register).toContain(
			"| Fingerprint | Story | Severity | Disposition | Reason |",
		);
		expect(register).toContain(
			"| silent-failure\\|ui-toast--error\\|no-announcement | ui-toast--error | critical | fix-v5.1 | The toast shows a failure but nothing announces it. |",
		);
	});

	test("contrast-gap entries print grouped by pair and backdrop, one row for both themes, with no reason column", () => {
		const gap = (rule: string, story = "file-list-filetable--mixed-statuses") =>
			entry("contrast-gap", story, rule, {
				severity: "major",
				reason: "a quoted measured reason that stays in the JSON",
			});
		const planted = renderFindings({
			baseline: {
				entries: [
					REGISTER,
					gap("text-secondary-on-bg-light"),
					gap("text-secondary-on-bg-dark"),
					gap(
						"muted-on-surface-light",
						"file-list-folderrow--complete-collapsed",
					),
				],
			},
			copyFindings: { entries: [] },
		});
		const gaps = section(planted, "Contrast gaps");
		expect(gaps).toContain("3 entries across 2 pairs");
		expect(gaps).toContain("| Pair | Themes | Story | Disposition |");
		expect(gaps).toContain(
			"| text-secondary-on-bg | dark, light | file-list-filetable--mixed-statuses | fix-v5.1 |",
		);
		expect(gaps).toContain(
			"| muted-on-surface | light | file-list-folderrow--complete-collapsed | fix-v5.1 |",
		);
		expect(gaps).not.toContain("quoted measured reason");
		// The other register kinds still print in full, and no contrast row is among them.
		const register = section(planted, "Register");
		expect(register).toContain(
			"silent-failure\\|ui-toast--error\\|no-announcement",
		);
		expect(register).not.toContain("contrast-gap");
		// The section sits after the register table and before the verdict log.
		expect(planted.indexOf("## Contrast gaps")).toBeGreaterThan(
			planted.indexOf("## Register"),
		);
		expect(planted.indexOf("## Contrast gaps")).toBeLessThan(
			planted.indexOf("## Rejected (verdict log)"),
		);
	});

	test("without contrast-gap entries there is no contrast section, and an all-contrast register prints none above it", () => {
		expect(text).not.toContain("## Contrast gaps");
		const only = renderFindings({
			baseline: {
				entries: [
					entry("contrast-gap", "ui-a--one", "muted-on-bg-light", {
						severity: "major",
					}),
				],
			},
			copyFindings: { entries: [] },
		});
		expect(section(only, "Register").trim().endsWith("none")).toBe(true);
		expect(section(only, "Contrast gaps")).toContain(
			"1 entries across 1 pairs",
		);
	});

	test("a reject entry is excluded from the register and listed with its verdict row", () => {
		expect(section(text, "Register")).not.toContain("hover-motion");
		const rejected = section(text, "Rejected (verdict log)");
		expect(rejected).toContain(
			"layout-gap\\|file-list-filerow--cleaned\\|hover-motion",
		);
		expect(rejected).toContain("2026-11-13");
		expect(rejected).toContain("maintainer");
		expect(rejected).toContain("agreed: leave it listed and quiet");
	});

	test("axe kinds are summarised by kind, rule and disposition with counts and no per-entry rows", () => {
		const summary = section(text, "Accessibility baseline (summary)");
		expect(summary).toContain(
			"| Kind | Rule | Disposition | Severity | Count |",
		);
		expect(summary).toContain(
			"| a11y-p72 | color-contrast | fix-v5.1 | major | 2 |",
		);
		expect(summary).toContain(
			"| a11y-p73 | aria-conditional-attr | fix-v5.2 | major | 1 |",
		);
		for (const story of ["ui-a--one", "ui-a--two", "ui-b--one"]) {
			expect(text).not.toContain(story);
		}
		// Register entries never appear in the axe summary, nor axe entries in the register.
		expect(summary).not.toContain("silent-failure");
	});

	test("copy-findings are a cross-reference only, by fingerprint and disposition, sorted", () => {
		const copy = section(text, "Copy findings (cross-reference)");
		expect(copy).toContain("have no story id");
		expect(copy).toContain("| Fingerprint | Disposition |");
		const a = copy.indexOf("hardcoded\\|src:src/a.tsx\\|Close");
		const x = copy.indexOf("hardcoded\\|src:src/x.tsx\\|Try again");
		expect(a).toBeGreaterThan(0);
		expect(x).toBeGreaterThan(a);
		expect(copy).toContain("| hardcoded\\|src:src/a.tsx\\|Close | accept |");
		// Never mixed into the register.
		expect(section(text, "Register")).not.toContain("hardcoded");
	});

	test("empty inputs render each section as none", () => {
		const empty = renderFindings({ baseline: {}, copyFindings: {} });
		expect(empty.match(/^none$/gm)).toHaveLength(4);
	});

	test("a pipe or a line break in a cell cannot break a row", () => {
		const nasty = entry("token-gap", "ui-x--y", "a-slug", {
			severity: "minor",
			reason: "has a | pipe\r\nand a break",
		});
		const out = renderFindings({
			baseline: { entries: [nasty] },
			copyFindings: {},
		});
		expect(out).not.toContain("\r");
		expect(out).toContain("has a \\| pipe and a break");
		const row = out.split("\n").find((line) => line.includes("a-slug"));
		expect((row ?? "").replace(/\\\|/g, "").split("|")).toHaveLength(7);
	});
});

describe("renderFindings byte properties", () => {
	test("the output is byte-stable, has no carriage return and ends with exactly one newline", () => {
		const text = renderFindings(PLANTED);
		expect(renderFindings(PLANTED)).toBe(text);
		expect(text).not.toContain("\r");
		expect(text.endsWith("\n")).toBe(true);
		expect(text.endsWith("\n\n")).toBe(false);
	});

	test("the output is identical for the same input in any entry order", () => {
		const text = renderFindings(PLANTED);
		const shuffled = renderFindings({
			baseline: {
				entries: [AXE_C, AXE_B, REJECTED, AXE_A, REGISTER],
				verdicts: [verdict(REJECTED)],
			},
			copyFindings: { entries: [...COPY].reverse() },
		});
		expect(shuffled).toBe(text);
	});

	test("the renderer imports nothing from scripts/", () => {
		const source = fs.readFileSync(
			path.join(repoRoot, ".storybook/catalog/findings_view.mjs"),
			"utf8",
		);
		expect(source).not.toMatch(/from\s+["'][^"']*scripts\//);
		expect(source).not.toMatch(/^import\s/m);
	});
});

type RenderInputs = Parameters<typeof renderFindings>[0];

// Everything the real-documents run asserts, as one function over any two documents, so
// the same assertions also run on a register burned down to zero (the intended end
// state). It asserts the shape of the output, never that anything is left to list.
function expectRegistersAccounted({
	baseline: base,
	copyFindings: copy,
}: RenderInputs) {
	const text = renderFindings({ baseline: base, copyFindings: copy });
	expect(text).toContain("## Accessibility baseline (summary)");
	expect(text).toContain("## Copy findings (cross-reference)");

	const summary = section(text, "Accessibility baseline (summary)");
	const counted = [...summary.matchAll(/\| major \| (\d+) \|/g)].reduce(
		(sum, match) => sum + Number(match[1]),
		0,
	);
	const axe = (base.entries ?? []).filter(
		(found) =>
			/^a11y(-p\d+)?$/.test(found.kind) && found.disposition !== "reject",
	);
	expect(counted).toBe(axe.length);
	const summaryLines = summary.split("\n");
	if (axe.length === 0) {
		// An empty register renders "none", not a table.
		expect(summaryLines).toContain("none");
	} else {
		expect(summaryLines).toContain(
			"| Kind | Rule | Disposition | Severity | Count |",
		);
	}

	const copyEntries = copy.entries ?? [];
	const copySection = section(text, "Copy findings (cross-reference)");
	const copyLines = copySection.split("\n");
	const tableLines = copyLines.filter((line) => line.startsWith("| "));
	if (copyEntries.length === 0) {
		expect(copyLines).toContain("none");
		expect(tableLines).toEqual([]);
	} else {
		expect(tableLines[0]).toBe("| Fingerprint | Disposition |");
		// Two table lines (header and separator), then one row per copy finding.
		expect(tableLines.length - 2).toBe(copyEntries.length);
	}
}

describe("renderFindings over the real documents", () => {
	test("the real baseline and copy-findings render, with the axe summary and every entry accounted for", () => {
		expectRegistersAccounted({
			baseline: baseline as unknown as RenderInputs["baseline"],
			copyFindings,
		});
	});

	// 73-fix WR-04: burning the registers down to zero is the goal, so it must not turn
	// the suite red. The last fix PR would otherwise fail a test it did not cause.
	test("a register burned down to zero axe entries and zero copy findings still renders its sections", () => {
		expectRegistersAccounted({
			baseline: { entries: [], verdicts: [] },
			copyFindings: { entries: [] },
		});
	});
});
