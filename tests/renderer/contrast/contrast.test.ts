import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	compareBaseline,
	contrastGapEntry,
	evaluate,
	failingFingerprints,
	reasonFor,
	type ContrastPair,
	type ContrastPairsDocument,
} from "./contrast_model.mjs";
import {
	contrastRatio,
	flatten,
	formatRatio,
	parseColour,
	toHex,
} from "./wcag.mjs";

// SPEC-02 / SC3: a static contrast test over the declared foreground/background
// token pairs in both themes. Every planted failure below is an in-memory string or
// a cloned document, so the test needs no directory of its own.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

function readText(relPath: string): string {
	return fs.readFileSync(path.join(REPO, relPath), "utf8");
}

function readJson<T>(relPath: string): T {
	return JSON.parse(readText(relPath)) as T;
}

const TOKENS_CSS = readText("src/renderer/styles/tokens.css");
const PAIRS = readJson<ContrastPairsDocument>(
	"tests/renderer/contrast/contrast_pairs.json",
);
const BASELINE = readJson<{
	kinds: Record<string, { sealed: boolean }>;
	entries: Array<{ fingerprint: string; kind: string; reason: string }>;
}>("docs/evidence/known-findings.json");

function colour(text: string) {
	const parsed = parseColour(text);
	if (parsed === null) throw new Error(`${text} is not a colour`);
	return parsed;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

// G3: the helper is pinned to what axe measured in the story runs. Each triple is
// a literal copied from a `color-contrast` entry of known-findings.json; the entry
// must still hold the same hexes and ratio, so neither side can drift alone.
const AXE_TRIPLES = [
	{
		fg: "#66758c",
		bg: "#f5f6f8",
		ratio: "4.32",
		fingerprint: "a11y-p72|ui-statusbar--all-cleaned|color-contrast",
	},
	{
		fg: "#66758c",
		bg: "#eadee1",
		ratio: "3.57",
		fingerprint: "a11y-p72|file-list-metadatafield--removed|color-contrast",
	},
	{
		fg: "#818188",
		bg: "#372122",
		ratio: "3.86",
		fingerprint: "a11y-p72|file-list-metadatafield--removed|color-contrast",
	},
	{
		fg: "#66758c",
		bg: "#dae9e4",
		ratio: "3.73",
		fingerprint: "a11y-p72|file-list-metadatafield--preserved|color-contrast",
	},
	{
		fg: "#9da7b6",
		bg: "#e8ecf0",
		ratio: "2.04",
		fingerprint:
			"a11y-p72|file-list-folderrow--complete-collapsed|color-contrast",
	},
	{
		fg: "#636369",
		bg: "#1c1c1f",
		ratio: "2.84",
		fingerprint:
			"a11y-p72|file-list-folderrow--complete-collapsed|color-contrast",
	},
	{
		fg: "#6a8fa8",
		bg: "#e9eef2",
		ratio: "2.94",
		fingerprint: "a11y-p73|file-list-filerow--cleaned|color-contrast",
	},
	{
		fg: "#b07a70",
		bg: "#281f20",
		ratio: "4.48",
		fingerprint: "a11y-p72|ui-typepill--pdf|color-contrast",
	},
] as const;

describe("G3: the helper reproduces axe's recorded ratios", () => {
	test("eight triples agree at floor-to-2dp and the baseline entries still quote them", () => {
		expect(AXE_TRIPLES).toHaveLength(8);
		for (const triple of AXE_TRIPLES) {
			const measured = formatRatio(
				contrastRatio(colour(triple.fg), colour(triple.bg)),
			);
			expect(measured, `${triple.fg} on ${triple.bg}`).toBe(triple.ratio);
			const entry = BASELINE.entries.find(
				(candidate) => candidate.fingerprint === triple.fingerprint,
			);
			expect(entry, triple.fingerprint).toBeDefined();
			expect(entry?.reason).toContain(triple.fg);
			expect(entry?.reason).toContain(triple.bg);
			expect(entry?.reason).toContain(`${triple.ratio}:1`);
		}
	});

	test("the triples cover flattened backgrounds, the dark theme and a pill", () => {
		const flattened = ["#eadee1", "#dae9e4", "#372122"];
		expect(
			AXE_TRIPLES.filter((t) => flattened.includes(t.bg)).length,
		).toBeGreaterThanOrEqual(2);
		const dark = ["#818188", "#636369", "#b07a70"];
		expect(
			AXE_TRIPLES.filter((t) => dark.includes(t.fg)).length,
		).toBeGreaterThanOrEqual(2);
		expect(AXE_TRIPLES.some((t) => t.bg === "#e9eef2")).toBe(true);
	});

	test("flattening in gamma-encoded sRGB gives the background axe reports", () => {
		const removed = flatten(
			colour("rgba(255, 59, 48, 0.08)"),
			colour("#e8ecf0"),
		);
		expect(toHex(removed)).toBe("#eadee1");
		const preserved = flatten(
			colour("rgba(52, 199, 89, 0.08)"),
			colour("#e8ecf0"),
		);
		expect(toHex(preserved)).toBe("#dae9e4");
	});

	test("floor, not round: 4.5 is the unrounded comparison", () => {
		expect(formatRatio(4.499)).toBe("4.49");
		expect(formatRatio(4.35)).toBe("4.35");
	});
});

describe("tracer: text-secondary through tokens.css, flattening and the ratio", () => {
	const tracer = PAIRS.pairs.find((pair) => pair.id === "text-secondary");

	test("the real pair is evaluated on every surface in both themes", () => {
		expect(tracer).toBeDefined();
		const results = evaluate(PAIRS, TOKENS_CSS).filter(
			(result) => result.pair === "text-secondary",
		);
		expect(results).toHaveLength(PAIRS.surfaces.length * 2);
		for (const result of results) {
			expect(Number.isFinite(result.ratio), result.rule).toBe(true);
			expect(result.fingerprint).toBe(
				`contrast-gap|${result.story}|${result.rule}`,
			);
		}
		const light = results.find((r) => r.rule === "text-secondary-on-bg-light");
		expect(light).toBeDefined();
		expect(formatRatio(light?.ratio ?? 0)).toBe("4.32");
		expect(light?.pass).toBe(false);
	});

	test("shown red: a planted failing pair is in the failing set and is a new failure", () => {
		const passing: ContrastPair = {
			id: "text",
			fg: "--ec-color-text",
			on: ["--ec-color-bg"],
			role: "text",
			selector: ".app",
			story: "file-list-filetable--mixed-statuses",
		};
		const control = { ...clone(PAIRS), pairs: [passing] };
		expect(failingFingerprints(evaluate(control, TOKENS_CSS)).size).toBe(0);

		const planted = {
			...clone(PAIRS),
			pairs: [{ ...passing, on: ["#9da7b6"] }],
		};
		const failing = failingFingerprints(evaluate(planted, TOKENS_CSS));
		expect([...failing].sort()).toEqual([
			"contrast-gap|file-list-filetable--mixed-statuses|text-on-hex-9da7b6-dark",
			"contrast-gap|file-list-filetable--mixed-statuses|text-on-hex-9da7b6-light",
		]);
		expect(compareBaseline(failing, []).newFailures).toEqual(
			[...failing].sort(),
		);
		expect(compareBaseline(failing, []).fixedStillListed).toEqual([]);
	});

	test("shown red: a listed entry that now passes is fixed-still-listed", () => {
		const passing: ContrastPair = {
			id: "text",
			fg: "--ec-color-text",
			on: ["--ec-color-bg"],
			role: "text",
			selector: ".app",
			story: "file-list-filetable--mixed-statuses",
		};
		const planted = {
			...clone(PAIRS),
			pairs: [{ ...passing, on: ["#9da7b6"] }],
		};
		const [first] = evaluate(planted, TOKENS_CSS);
		if (first === undefined) throw new Error("no planted result");
		const entry = contrastGapEntry(first);
		expect(compareBaseline(new Set<string>(), [entry])).toEqual({
			newFailures: [],
			fixedStillListed: [entry.fingerprint],
		});
		// Only contrast-gap entries count: an axe entry never reads as fixed.
		expect(
			compareBaseline(new Set<string>(), [
				{ kind: "a11y-p72", fingerprint: "a11y-p72|x|color-contrast" },
			]),
		).toEqual({ newFailures: [], fixedStillListed: [] });
	});

	test("the entry reads in the canonical sentence and key order", () => {
		const [first] = evaluate(
			{
				...clone(PAIRS),
				pairs: [
					{
						id: "text",
						fg: "--ec-color-text",
						on: ["#9da7b6"],
						role: "text",
						selector: ".app",
						story: "file-list-filetable--mixed-statuses",
					},
				],
			},
			TOKENS_CSS,
		);
		if (first === undefined) throw new Error("no result");
		expect(reasonFor(first)).toBe(
			`Selector .app: --ec-color-text #3b4351 on the literal #9da7b6 #9da7b6 measures ${formatRatio(first.ratio)}:1 in the light theme (text, needs 4.5:1); v5.1 fixes it against the UI-SPEC palette.`,
		);
		expect(Object.keys(contrastGapEntry(first))).toEqual([
			"fingerprint",
			"kind",
			"story",
			"rule",
			"reason",
			"disposition",
			"severity",
		]);
	});
});
