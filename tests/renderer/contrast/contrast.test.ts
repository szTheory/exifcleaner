import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	backdrops,
	brandRatioProblems,
	colourLiterals,
	compareBaseline,
	contrastGapEntry,
	evaluate,
	failingFingerprints,
	g1Problems,
	g2Report,
	pairsShapeProblems,
	proposedConsistencyProblems,
	proposedResults,
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

// ---------------------------------------------------------------------------
// The completeness guards (D-22). Each is shown red by an in-memory planting: a
// cloned document or a stylesheet map with one edit, never a file on disk.
// ---------------------------------------------------------------------------

const STYLES_DIR = "src/renderer/styles";
const SHEETS: Record<string, string> = Object.fromEntries(
	fs
		.readdirSync(path.join(REPO, STYLES_DIR))
		.filter((name) => name.endsWith(".css"))
		.sort()
		.map((name) => [name, readText(`${STYLES_DIR}/${name}`)]),
);
const TOKEN_MAP = readJson<{
	entries: Array<{ name: string; disposition: string; finding?: string }>;
}>(".storybook/catalog/token_map.json");
const UI_SPEC = readJson<unknown>(".storybook/catalog/ui-spec.json");
const PIN = readJson<{ commit: string }>("brand.pin.json").commit;

function codes(problems: Array<{ code: string }>): string[] {
	return problems.map((found) => found.code);
}

function g2(
	sheets: Record<string, string> = SHEETS,
	doc: ContrastPairsDocument = PAIRS,
	tokenMap: typeof TOKEN_MAP = TOKEN_MAP,
) {
	return g2Report(sheets, doc, TOKENS_CSS, tokenMap);
}

function withRule(file: string, rule: string): Record<string, string> {
	return { ...SHEETS, [file]: `${SHEETS[file] ?? ""}\n${rule}\n` };
}

function withoutPairs(...ids: string[]): ContrastPairsDocument {
	const doc = clone(PAIRS);
	doc.pairs = doc.pairs.filter((pair) => !ids.includes(pair.id));
	return doc;
}

describe("the pair list is real, not a stub", () => {
	test("it declares more than thirty pairs and evaluates over a hundred results", () => {
		expect(PAIRS.pairs.length).toBeGreaterThanOrEqual(30);
		expect(evaluate(PAIRS, TOKENS_CSS).length).toBeGreaterThanOrEqual(100);
		for (const pair of PAIRS.pairs) {
			expect(pair.id.startsWith("a11y"), pair.id).toBe(false);
			expect(pair.id, pair.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	test("every rule slug is unique, so no two failures share a fingerprint", () => {
		const fingerprints = evaluate(PAIRS, TOKENS_CSS).map((r) => r.fingerprint);
		expect(new Set(fingerprints).size).toBe(fingerprints.length);
	});

	test("the hover overlay is a surface the text pairs are measured on (D-06)", () => {
		expect(PAIRS.surfaces).toContain("item-hover");
		const pair = PAIRS.pairs.find(
			(candidate) => candidate.id === "text-secondary",
		);
		expect(pair).toBeDefined();
		expect(backdrops(pair as ContrastPair, PAIRS).map((b) => b.ref)).toContain(
			"item-hover",
		);
		// text-secondary on the hover overlay in the light theme measures 3.62:1.
		const result = evaluate(PAIRS, TOKENS_CSS).find(
			(r) => r.rule === "text-secondary-on-item-hover-light",
		);
		expect(formatRatio(result?.ratio ?? 0)).toBe("3.62");
		expect(result?.bgHex).toBe("#dfe3e6");
	});

	test("the pill text pairs list the pill over the ground and over the surface", () => {
		for (const family of ["jpg", "heic", "png", "pdf", "mov", "dng"]) {
			const pair = PAIRS.pairs.find((p) => p.id === `pill-${family}`);
			expect(pair, family).toBeDefined();
			expect(backdrops(pair as ContrastPair, PAIRS).map((b) => b.ref)).toEqual([
				`pill-${family}-bg-over-bg`,
				`pill-${family}-bg-over-surface`,
			]);
		}
	});
});

describe("G1: every colour token is a foreground, a backdrop or exempt", () => {
	test("the real tokens.css and pairs document have no problem", () => {
		expect(g1Problems(TOKENS_CSS, PAIRS)).toEqual([]);
	});

	test("shown red: a new colour token with no pair and no exemption", () => {
		const planted = TOKENS_CSS.replace(
			"\t--ec-color-info: #3b7fc4;",
			() => "\t--ec-color-planted: #123456;\n\t--ec-color-info: #3b7fc4;",
		).replace(
			"\t--ec-color-info: #6ba3d6;",
			() => "\t--ec-color-planted: #123456;\n\t--ec-color-info: #6ba3d6;",
		);
		expect(planted.match(/--ec-color-planted/g)).toHaveLength(2);
		const found = g1Problems(planted, PAIRS);
		expect(codes(found)).toEqual(["g1-uncovered-token"]);
		expect(found[0]?.message).toContain("--ec-color-planted");
	});

	test("shown red: a light colour token the dark block does not define", () => {
		const planted = TOKENS_CSS.replace("\t--ec-color-muted: #636369;\n", "");
		expect(planted).not.toBe(TOKENS_CSS);
		const found = g1Problems(planted, PAIRS);
		expect(codes(found)).toEqual(["g1-missing-dark"]);
		expect(found[0]?.message).toContain("--ec-color-muted");
	});

	test("an alias is judged through its target, never on its own", () => {
		// --color-bg holds var(--ec-color-bg) in both blocks; it is no token of its own.
		const planted = TOKENS_CSS.replaceAll(
			"--color-bg: var(--ec-color-bg);",
			"--color-bg: var(--ec-color-bg);\n\t--color-bg-twin: var(--ec-color-bg);",
		);
		expect(g1Problems(planted, PAIRS)).toEqual([]);
	});
});

describe("colourLiterals: the literal scan", () => {
	test("finds hex, rgb and rgba calls, and the three keywords, nested var included", () => {
		expect(colourLiterals("1px solid #006bd6").map((l) => l.text)).toEqual([
			"#006bd6",
		]);
		expect(
			colourLiterals("rgba(0, 0, 0, var(--ec-backdrop-opacity))").map(
				(l) => l.text,
			),
		).toEqual(["rgba(0, 0, 0, var(--ec-backdrop-opacity))"]);
		expect(
			colourLiterals("var(--ec-color-hover, rgba(0, 0, 0, 0.04))").map(
				(l) => l.normalised,
			),
		).toEqual(["rgba(0, 0, 0, 0.04)"]);
		expect(colourLiterals("2px solid transparent").map((l) => l.text)).toEqual([
			"transparent",
		]);
		expect(colourLiterals("white").map((l) => l.text)).toEqual(["white"]);
	});

	test("a keyword inside a name, and inherit, currentColor and none, are not literals", () => {
		expect(colourLiterals("var(--ec-color-white)")).toEqual([]);
		expect(colourLiterals("inherit")).toEqual([]);
		expect(colourLiterals("currentColor")).toEqual([]);
		expect(colourLiterals("none")).toEqual([]);
	});

	test("whitespace and case are normalised, nothing else", () => {
		expect(
			colourLiterals("RGBA( 0,0 ,0,  0.04 )").map((l) => l.normalised),
		).toEqual(["rgba(0, 0, 0, 0.04)"]);
		expect(colourLiterals("#FFF").map((l) => l.normalised)).toEqual(["#fff"]);
	});

	test("a 200 KB value returns well inside a second (T-74-14)", () => {
		const hashes = "#".repeat(200_000);
		const calls = "rgba(".repeat(40_000);
		const names = "var(".repeat(50_000);
		const started = Date.now();
		colourLiterals(hashes);
		colourLiterals(calls);
		colourLiterals(names);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});

describe("G2: every stylesheet colour use is classified", () => {
	test("the real stylesheets, pairs document and token map have no problem", () => {
		const report = g2();
		expect(report.problems).toEqual([]);
		// Anti-vacuity: a rule set that classifies nothing would pass the line above.
		expect(report.classified).toBeGreaterThanOrEqual(100);
		expect(report.background).toBeGreaterThanOrEqual(25);
	});

	test("every declared literal's files really hold it", () => {
		const literals = PAIRS.literals as Array<{
			value: string;
			files: string[];
		}>;
		expect(literals.length).toBeGreaterThanOrEqual(10);
		for (const entry of literals) {
			for (const file of entry.files) {
				const text = SHEETS[file];
				expect(text, `${entry.value} in ${file}`).toBeDefined();
				const held = colourLiterals(text ?? "").some(
					(literal) => literal.normalised === entry.value,
				);
				expect(held, `${entry.value} in ${file}`).toBe(true);
			}
		}
	});

	const planted: Array<[string, string, string, string[]]> = [
		[
			"a token that is only a surface, used as text",
			"app.css",
			".planted { color: var(--ec-color-error-bg); }",
			["g2-unpaired-foreground"],
		],
		[
			"a foreground no pair takes as a backdrop, used as a background",
			"app.css",
			".planted { background: var(--ec-color-muted); }",
			["g2-unknown-surface"],
		],
		[
			"an exempt token without a fill reason, used as a background",
			"app.css",
			".planted { background: var(--ec-shadow-drawer); }",
			["g2-unknown-surface"],
		],
		[
			"a text pair foreground used as an outline",
			"app.css",
			".planted { outline: 2px solid var(--ec-color-text-secondary); }",
			["g2-unpaired-focus"],
		],
		[
			"an undeclared token under a border colour",
			"app.css",
			".planted { border-color: var(--ec-color-planted-x); }",
			["g2-unclassified-token"],
		],
		[
			"an undeclared token with a fallback and no token map finding",
			"app.css",
			".planted { background: var(--ec-color-planted-y, #ffffff); }",
			["g2-unclassified-token"],
		],
		[
			"the registered hover name whose fallback literal is no backdrop",
			"app.css",
			".planted { background: var(--ec-color-hover, #ffffff); }",
			["g2-unknown-surface"],
		],
		[
			"a colour literal no entry declares",
			"app.css",
			".planted { color: #abcdef; }",
			["g2-undeclared-literal"],
		],
		[
			"color-mix",
			"app.css",
			".planted { color: color-mix(in srgb, red, blue); }",
			["g2-forbidden-function"],
		],
		[
			"light-dark",
			"app.css",
			".planted { background: light-dark(#fff, #000); }",
			["g2-forbidden-function"],
		],
	];
	for (const [name, file, rule, expected] of planted) {
		test(`shown red: ${name}`, () => {
			expect(codes(g2(withRule(file, rule)).problems)).toEqual(expected);
		});
	}

	test("the registered hover fallback is classified against the backdrop union, not skipped", () => {
		// The real tree uses it, and it passes only because the fallback is the
		// hover overlay's own layer.
		const hover = Object.entries(SHEETS).filter(([, text]) =>
			text.includes("var(--ec-color-hover, rgba(0, 0, 0, 0.04))"),
		);
		expect(hover.map(([file]) => file)).toEqual(["language_dropdown.css"]);
		expect(g2().problems).toEqual([]);
	});

	test("route: dropping the fill reason of the border exemption reds the separator", () => {
		const doc = clone(PAIRS);
		const entry = (doc.exempt as Array<Record<string, string>>).find(
			(candidate) => candidate["name"] === "--ec-color-border",
		);
		if (entry === undefined) throw new Error("no border exemption");
		delete entry["fill"];
		const found = g2(SHEETS, doc).problems;
		expect(codes(found)).toEqual(["g2-unknown-surface"]);
		expect(found.map((problem) => problem.file)).toEqual([
			"language_dropdown.css",
		]);
	});

	test("route: dropping the fill reason of the backdrop opacity reds the scrim", () => {
		const doc = clone(PAIRS);
		const entry = (doc.exempt as Array<Record<string, string>>).find(
			(candidate) => candidate["name"] === "--ec-backdrop-opacity",
		);
		if (entry === undefined) throw new Error("no backdrop exemption");
		delete entry["fill"];
		const found = g2(SHEETS, doc).problems;
		expect(codes(found)).toEqual(["g2-unknown-surface"]);
		expect(found.map((problem) => problem.file)).toEqual([
			"settings_drawer.css",
		]);
	});

	test("route: dropping the hover token's finding from the map reds exactly that name", () => {
		const map = clone(TOKEN_MAP);
		const entry = map.entries.find(
			(candidate) => candidate.name === "--ec-color-hover",
		);
		if (entry === undefined) throw new Error("no hover entry");
		delete entry.finding;
		const found = g2(SHEETS, PAIRS, map).problems;
		expect(codes(found)).toEqual(["g2-unclassified-token"]);
		expect(found[0]?.message).toContain("--ec-color-hover");
	});

	test("route: dropping the selection and the on-track thumb pairs reds both accent backdrops", () => {
		const found = g2(
			SHEETS,
			withoutPairs("selection", "toggle-thumb-on"),
		).problems;
		expect(codes(found)).toEqual(["g2-unknown-surface", "g2-unknown-surface"]);
		expect(found.map((problem) => problem.file).sort()).toEqual([
			"toggle_switch.css",
			"tokens.css",
		]);
	});

	test("route: dropping the off-track thumb pair reds the off track", () => {
		const found = g2(SHEETS, withoutPairs("toggle-thumb-off")).problems;
		expect(codes(found)).toEqual(["g2-unknown-surface"]);
		expect(found.map((problem) => problem.file)).toEqual(["toggle_switch.css"]);
	});

	test("route: dropping the toast pair reds the toast in four places", () => {
		const found = g2(SHEETS, withoutPairs("toast-text")).problems;
		expect(found.map((problem) => problem.file)).toEqual([
			"toast.css",
			"toast.css",
			"toast.css",
			"toast.css",
		]);
		expect(codes(found).sort()).toEqual([
			"g2-unknown-surface",
			"g2-unknown-surface",
			"g2-unpaired-foreground",
			"g2-unpaired-foreground",
		]);
	});
});

describe("the pairs document is a closed shape", () => {
	test("the real document has no problem", () => {
		expect(pairsShapeProblems(PAIRS)).toEqual([]);
	});

	test("shown red: an unknown top-level key", () => {
		const doc = { ...clone(PAIRS), extra: 1 };
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
	});

	test("shown red: a pair with the role large", () => {
		const doc = clone(PAIRS);
		const pair = doc.pairs[0];
		if (pair === undefined) throw new Error("no pair");
		(pair as { role: string }).role = "large";
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
	});

	test("shown red: a pair without a story", () => {
		const doc = clone(PAIRS);
		const pair = doc.pairs[0] as unknown as Record<string, unknown> | undefined;
		if (pair === undefined) throw new Error("no pair");
		delete pair["story"];
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
	});

	test("shown red: an exempt entry with a key other than name, reason and fill", () => {
		const doc = clone(PAIRS);
		const entry = (doc.exempt as Array<Record<string, unknown>>)[0];
		if (entry === undefined) throw new Error("no exempt entry");
		entry["why"] = "extra";
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
	});

	test("shown red: a literal that names no pair, and a duplicate pair id", () => {
		const doc = clone(PAIRS);
		const literal = (doc.literals as Array<Record<string, unknown>>).find(
			(candidate) => typeof candidate["pair"] === "string",
		);
		if (literal === undefined) throw new Error("no pair literal");
		literal["pair"] = "no-such-pair";
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
		const twice = clone(PAIRS);
		const first = twice.pairs[0];
		if (first === undefined) throw new Error("no pair");
		twice.pairs.push({ ...first });
		expect(codes(pairsShapeProblems(twice))).toEqual(["pairs-shape"]);
	});
});

describe("the proposed v5.1 palette (D-26): hermetic, all-pass, never baselined", () => {
	test("every proposed pair meets its role threshold", () => {
		const results = proposedResults(PAIRS);
		expect(results.length).toBeGreaterThanOrEqual(20);
		const failing = results.filter((result) => !result.pass);
		expect(failing.map((r) => `${r.id} ${formatRatio(r.ratio)}:1`)).toEqual([]);
	});

	test("it holds pill text on the resting pill and on the ground, by tokens path", () => {
		const raw = JSON.stringify(PAIRS.proposed);
		expect(raw).not.toContain('"ref":"dark-rinse.pill-on-raised"');
		expect(raw).toContain('"ref":"color.light.clean-white"');
		expect(raw).toContain('"ref":"color.dark.deep-teal"');
	});

	test("the pin, the ui-spec hexes and the adopted map hexes agree", () => {
		expect(
			proposedConsistencyProblems(PAIRS, {
				uiSpec: UI_SPEC,
				tokenMap: TOKEN_MAP,
				pin: PIN,
			}),
		).toEqual([]);
	});

	test("shown red: a proposed hex edited away from the spec names the ref", () => {
		const doc = clone(PAIRS);
		const proposed = doc.proposed as Array<{
			fg: { ref: string; hex: string };
		}>;
		const target = proposed.find(
			(row) => row.fg.ref === "color.light.deep-teal",
		);
		if (target === undefined) throw new Error("no deep teal row");
		target.fg.hex = "#0A2E2C";
		const found = proposedConsistencyProblems(doc, {
			uiSpec: UI_SPEC,
			tokenMap: TOKEN_MAP,
			pin: PIN,
		});
		expect(found.length).toBeGreaterThan(0);
		expect(
			found.some((problem) =>
				problem.message.includes("color.light.deep-teal"),
			),
		).toBe(true);
	});

	test("shown red: a proposed colour path the spec does not source names the path", () => {
		const doc = clone(PAIRS);
		const proposed = doc.proposed as Array<{
			fg: { ref: string; hex: string };
		}>;
		const target = proposed.find(
			(row) => row.fg.ref === "color.light.deep-teal",
		);
		if (target === undefined) throw new Error("no deep teal row");
		target.fg.ref = "color.light.exifcleaner-teal";
		const found = proposedConsistencyProblems(doc, {
			uiSpec: UI_SPEC,
			tokenMap: TOKEN_MAP,
			pin: PIN,
		});
		expect(
			found.some(
				(problem) =>
					problem.code === "proposed-path-unsourced" &&
					problem.message.includes("color.light.exifcleaner-teal"),
			),
		).toBe(true);
	});

	test("shown red: a brandPin that is not the pinned commit", () => {
		const doc = { ...clone(PAIRS), brandPin: "0".repeat(40) };
		expect(
			codes(
				proposedConsistencyProblems(doc, {
					uiSpec: UI_SPEC,
					tokenMap: TOKEN_MAP,
					pin: PIN,
				}),
			),
		).toEqual(["proposed-pin-mismatch"]);
	});

	test("shown red: a proposed pair below its threshold is reported failing", () => {
		const doc = clone(PAIRS);
		const proposed = doc.proposed as Array<{
			bg: { ref: string; hex: string };
		}>;
		const first = proposed[0];
		if (first === undefined) throw new Error("no proposed pair");
		first.bg = { ref: first.bg.ref, hex: "#0F766E" };
		expect(proposedResults(doc).some((result) => !result.pass)).toBe(true);
	});
});

describe("the BRAND.md Color: combinations ratios (G3)", () => {
	test("twelve rows, each rounding to the quoted ratio within 0.005", () => {
		expect(PAIRS.brandRatios).toHaveLength(12);
		expect(brandRatioProblems(PAIRS)).toEqual([]);
	});

	test("shown red: a quoted ratio the colours do not give", () => {
		const doc = clone(PAIRS);
		const rows = doc.brandRatios as Array<{ ratio: string }>;
		const first = rows[0];
		if (first === undefined) throw new Error("no ratio row");
		first.ratio = "14.70";
		expect(codes(brandRatioProblems(doc))).toEqual(["brand-ratio-mismatch"]);
	});
});
