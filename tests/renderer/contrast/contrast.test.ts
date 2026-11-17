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
	resolveColour,
	themeTokens,
	THEMES,
	THRESHOLDS,
	varReferences,
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
	entries: Array<{
		fingerprint: string;
		kind: string;
		story: string;
		rule: string;
		reason: string;
		disposition: string;
		severity?: string;
	}>;
}>("docs/evidence/known-findings.json");

function colour(text: string) {
	const parsed = parseColour(text);
	if (parsed === null) throw new Error(`${text} is not a colour`);
	return parsed;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

const PLATFORM_INDICATOR_ROLE = "--ec-color-platform-indicator";
const ITEM_HOVER_OVERLAY_ID = "item-hover";
const ITEM_HOVER_BASE = "--ec-color-surface";
const ITEM_HOVER_ENGLISH_ROLE = "--ec-color-text-secondary";
const PALETTE_HOVER_TEST_COLORS = {
	light: "#DCE6E5",
	dark: "#2E5753",
};

function itemHoverLayerFromCss(
	languageCss: string,
	tokensCss: string,
	doc: ContrastPairsDocument,
): string | null {
	const parentRule = languageCss.match(
		/\.language-dropdown__item:hover,\s*\.language-dropdown__item--focused\s*\{([^}]*)\}/s,
	);
	if (parentRule === null) return null;
	const declarations = [
		...(parentRule[1] ?? "").matchAll(
			/(?:^|;)\s*background\s*:\s*([^;]+)\s*;?/g,
		),
	];
	if (declarations.length !== 1) return null;
	const value = declarations[0]?.[1]?.trim().replace(/\s+/g, " ");
	const tokens = themeTokens(tokensCss);
	if (value === "var(--ec-color-hover, rgba(0, 0, 0, 0.04))") {
		const fallbackTokenResolves = THEMES.some(
			(theme) => resolveColour("--ec-color-hover", theme, tokens, doc) !== null,
		);
		return fallbackTokenResolves ? null : "rgba(0, 0, 0, 0.04)";
	}
	if (value === "var(--ec-color-surface-hover)") {
		const semanticTokenResolves = THEMES.every(
			(theme) =>
				resolveColour("--ec-color-surface-hover", theme, tokens, doc) !== null,
		);
		return semanticTokenResolves ? "--ec-color-surface-hover" : null;
	}
	return null;
}

function languageHoverContractProblems({
	languageComponent,
	languageCss,
	doc,
	tokensCss,
}: {
	languageComponent: string;
	languageCss: string;
	doc: ContrastPairsDocument;
	tokensCss: string;
}): string[] {
	const problems: string[] = [];
	if (
		!/<span className="language-dropdown__english">\s*\(\{lang\.englishName\}\)/.test(
			languageComponent,
		)
	) {
		problems.push("English label is not the language-dropdown__english child");
	}
	const englishRule = languageCss.match(
		/\.language-dropdown__english\s*\{([^}]*)\}/s,
	);
	const englishColor = (englishRule?.[1] ?? "")
		.match(/\bcolor\s*:\s*([^;]+)\s*;/)?.[1]
		?.trim();
	if (englishColor !== `var(${ITEM_HOVER_ENGLISH_ROLE})`) {
		problems.push("English child is not colored with text-secondary");
	}
	if (
		!languageCss.match(
			/\.language-dropdown__item:hover,\s*\.language-dropdown__item--focused\s*\{[^}]*\}/s,
		)
	) {
		problems.push("English item hover parent selector is missing");
	}
	const hoverLayer = itemHoverLayerFromCss(languageCss, tokensCss, doc);
	if (hoverLayer === null) {
		problems.push("English item hover background is unsupported or unresolved");
	}
	const pair = doc.pairs.find((entry) => entry.id === "text-secondary");
	if (pair?.fg !== ITEM_HOVER_ENGLISH_ROLE) {
		problems.push("English pair foreground is not text-secondary");
	}
	if (pair?.selector !== ".language-dropdown__english") {
		problems.push("English pair selector does not identify its source child");
	}
	const pairBackdrops =
		pair === undefined ? [] : typeof pair.on === "string" ? [pair.on] : pair.on;
	if (
		JSON.stringify(pairBackdrops) !==
		JSON.stringify([ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID])
	) {
		problems.push("English pair does not cover default surface and item-hover");
	}
	const overlay = doc.overlays.find(
		(entry) => entry.id === ITEM_HOVER_OVERLAY_ID,
	);
	if (overlay === undefined) {
		problems.push("English item-hover overlay is missing");
	}
	if (
		hoverLayer !== null &&
		overlay !== undefined &&
		JSON.stringify(overlay.layers) !==
			JSON.stringify([ITEM_HOVER_BASE, hoverLayer])
	) {
		problems.push("English item-hover overlay does not match its parent paint");
	}
	if (pair === undefined || overlay === undefined || hoverLayer === null) {
		return problems;
	}

	const tokens = themeTokens(tokensCss);
	for (const theme of THEMES) {
		const base = resolveColour(ITEM_HOVER_BASE, theme, tokens, doc);
		const paint = resolveColour(hoverLayer, theme, tokens, doc);
		const layers = overlay.layers.map((layer) =>
			resolveColour(layer, theme, tokens, doc),
		);
		if (
			base === null ||
			paint === null ||
			layers.some((layer) => layer === null)
		) {
			problems.push(`English item-hover backdrop is unresolved in ${theme}`);
			continue;
		}
		const expectedBackground = flatten(paint, base);
		const resolvedLayers = layers.filter(
			(layer): layer is NonNullable<typeof layer> => layer !== null,
		);
		let actualBackground = resolvedLayers[0];
		if (actualBackground === undefined) {
			problems.push(`English item-hover overlay is empty in ${theme}`);
			continue;
		}
		for (const layer of resolvedLayers.slice(1)) {
			actualBackground = flatten(layer, actualBackground);
		}
		if (toHex(actualBackground) !== toHex(expectedBackground)) {
			problems.push(
				`English item-hover backdrop mismatches source in ${theme}`,
			);
		}
		const result = evaluate(doc, tokensCss).find(
			(entry) =>
				entry.pair === pair.id &&
				entry.backdrop === ITEM_HOVER_OVERLAY_ID &&
				entry.theme === theme,
		);
		if (result?.bgHex !== toHex(expectedBackground)) {
			problems.push(`English evaluated backdrop mismatches source in ${theme}`);
		}
	}
	return problems;
}

function languageHoverPairFixture(hoverLayer: string): ContrastPairsDocument {
	const fixture = clone(PAIRS);
	fixture.surfaces = [
		...new Set([...fixture.surfaces, ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID]),
	];
	fixture.overlays = [
		...fixture.overlays.filter((entry) => entry.id !== ITEM_HOVER_OVERLAY_ID),
		{
			id: ITEM_HOVER_OVERLAY_ID,
			layers: [ITEM_HOVER_BASE, hoverLayer],
		},
	];
	if (hoverLayer === "--ec-color-surface-hover") {
		fixture.localTokens[hoverLayer] = { ...PALETTE_HOVER_TEST_COLORS };
	}
	fixture.pairs = fixture.pairs.filter(
		(pair) =>
			pair.id !== "text-secondary" &&
			pair.id !== "text-secondary-file-table-header",
	);
	fixture.pairs.push(
		{
			id: "text-secondary",
			fg: ITEM_HOVER_ENGLISH_ROLE,
			on: [ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID],
			role: "text",
			selector: ".language-dropdown__english",
			story: "settings-languagedropdown--item-hover",
		},
		{
			id: "text-secondary-file-table-header",
			fg: ITEM_HOVER_ENGLISH_ROLE,
			on: [ITEM_HOVER_BASE],
			role: "text",
			selector: ".file-table__header",
			story: "file-list-filetable--mixed-statuses",
		},
	);
	return fixture;
}

function withoutPlatformIndicatorReferences(
	doc: ContrastPairsDocument,
): ContrastPairsDocument {
	const fixture = clone(doc);
	const indicatorOverlays = new Set(
		fixture.overlays
			.filter((entry) => entry.layers.includes(PLATFORM_INDICATOR_ROLE))
			.map((entry) => entry.id),
	);
	fixture.overlays = fixture.overlays.filter(
		(entry) => !indicatorOverlays.has(entry.id),
	);
	fixture.pairs = fixture.pairs.filter((pair) => {
		const backdrops = typeof pair.on === "string" ? [pair.on] : pair.on;
		return (
			pair.fg !== PLATFORM_INDICATOR_ROLE &&
			!backdrops.includes(PLATFORM_INDICATOR_ROLE) &&
			!backdrops.some((ref) => indicatorOverlays.has(ref))
		);
	});
	fixture.surfaces = fixture.surfaces.filter(
		(ref) => ref !== PLATFORM_INDICATOR_ROLE && !indicatorOverlays.has(ref),
	);
	const localTokens = { ...fixture.localTokens };
	delete localTokens[PLATFORM_INDICATOR_ROLE];
	fixture.localTokens = localTokens;
	fixture.exempt = (fixture.exempt ?? []).filter(
		(entry) => entry.name !== PLATFORM_INDICATOR_ROLE,
	);
	return fixture;
}

// G3: the helper is pinned to what axe measured in the story runs. These historic
// quotes stay hermetic because the palette phase removes the corresponding findings.
// If a quote remains in the real register, it must still match this fixture.
const AXE_QUOTED_ENTRIES: Record<
	string,
	{
		kind: string;
		story: string;
		rule: string;
		reason: string;
		disposition: string;
	}
> = {
	"a11y-p72|ui-statusbar--all-cleaned|color-contrast": {
		kind: "a11y-p72",
		story: "ui-statusbar--all-cleaned",
		rule: "color-contrast",
		reason: [
			"Below 4.5:1 at normal weight (font size after each selector): the .status-bar__summary data-stat segments, 12px measures 4.32:1 (#66758c --ec-color-text-secondary on #f5f6f8 --ec-color-bg) in the light theme, passes in the dark theme;",
			".status-bar__button (Clear), 12px measures 3.71:1 (#007aff --ec-color-accent on #f5f6f8 --ec-color-bg) in the light theme, passes in the dark theme;",
			".status-bar__summary, 12px measures 4.32:1 (#66758c --ec-color-text-secondary on #f5f6f8 --ec-color-bg) in the light theme, passes in the dark theme; the token fix belongs to v5.1.",
		].join(" "),
		disposition: "fix-v5.1",
	},
	"a11y-p72|file-list-metadatafield--removed|color-contrast": {
		kind: "a11y-p72",
		story: "file-list-metadatafield--removed",
		rule: "color-contrast",
		reason: [
			"Below 4.5:1 at 14px normal weight: .metadata-field__value measures 3.57:1 (#66758c --ec-color-text-secondary on #eadee1 --ec-color-removed-bg) in the light theme,",
			"measures 3.86:1 (#818188 --ec-color-text-secondary on #372122 --ec-color-removed-bg) in the dark theme; the token fix belongs to v5.1.",
		].join(" "),
		disposition: "fix-v5.1",
	},
	"a11y-p72|file-list-metadatafield--preserved|color-contrast": {
		kind: "a11y-p72",
		story: "file-list-metadatafield--preserved",
		rule: "color-contrast",
		reason: [
			"Below 4.5:1 at 14px normal weight: .metadata-field__value measures 3.73:1 (#66758c --ec-color-text-secondary on #dae9e4 --ec-color-preserved-bg) in the light theme,",
			"measures 3.52:1 (#818188 --ec-color-text-secondary on #1e3226 --ec-color-preserved-bg) in the dark theme; the token fix belongs to v5.1.",
		].join(" "),
		disposition: "fix-v5.1",
	},
	"a11y-p72|file-list-folderrow--complete-collapsed|color-contrast": {
		kind: "a11y-p72",
		story: "file-list-folderrow--complete-collapsed",
		rule: "color-contrast",
		reason: [
			"Below 4.5:1 at 14px normal weight: .folder-row__count (the file count, --ec-color-muted) measures 2.04:1 (#9da7b6 --ec-color-muted on #e8ecf0 --ec-color-surface) in the light theme,",
			"measures 2.84:1 (#636369 --ec-color-muted on #1c1c1f --ec-color-surface) in the dark theme; the token fix belongs to v5.1.",
		].join(" "),
		disposition: "fix-v5.1",
	},
	"a11y-p73|file-list-filerow--cleaned|color-contrast": {
		kind: "a11y-p73",
		story: "file-list-filerow--cleaned",
		rule: "color-contrast",
		reason:
			"Selector .type-pill (the JPG pill) measures 2.94:1 in the light theme only, below 4.5:1: foreground #6a8fa8 on #e9eef2 (--ec-pill-jpg-text on --ec-pill-jpg-bg), 14px; the fix belongs to v5.1.",
		disposition: "fix-v5.1",
	},
	"a11y-p72|ui-typepill--pdf|color-contrast": {
		kind: "a11y-p72",
		story: "ui-typepill--pdf",
		rule: "color-contrast",
		reason:
			"Selector .type-pill--pdf measures 3.72:1 in the light theme (foreground #a06a60 on background #eeeaeb) and 4.48:1 in the dark theme (#b07a70 on #281f20), both below 4.5:1 (--ec-pill-pdf-text on --ec-pill-pdf-bg composited on the page), 14px normal weight; the family token fix belongs to v5.1.",
		disposition: "fix-v5.1",
	},
};

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
	test("eight triples agree at floor-to-2dp and any surviving entry keeps its quote", () => {
		expect(AXE_TRIPLES).toHaveLength(8);
		for (const triple of AXE_TRIPLES) {
			const measured = formatRatio(
				contrastRatio(colour(triple.fg), colour(triple.bg)),
			);
			expect(measured, `${triple.fg} on ${triple.bg}`).toBe(triple.ratio);
			const quoted = AXE_QUOTED_ENTRIES[triple.fingerprint];
			expect(quoted, triple.fingerprint).toBeDefined();
			expect(quoted?.reason).toContain(triple.fg);
			expect(quoted?.reason).toContain(triple.bg);
			expect(quoted?.reason).toContain(`${triple.ratio}:1`);
			const entry = BASELINE.entries.find(
				(candidate) => candidate.fingerprint === triple.fingerprint,
			);
			if (entry !== undefined) {
				expect({
					kind: entry.kind,
					story: entry.story,
					rule: entry.rule,
					reason: entry.reason,
					disposition: entry.disposition,
				}).toEqual(quoted);
			}
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
		if (light === undefined) throw new Error("light tracer result is missing");
		expect(light.threshold).toBe(THRESHOLDS.text);
		expect(light.pass).toBe(light.ratio >= light.threshold);
	});

	test("shown red: a planted failing pair is in the failing set and is a new failure", () => {
		const passing: ContrastPair = {
			id: "text",
			fg: "#777777",
			on: ["#ffffff"],
			role: "text",
			selector: ".app",
			story: "file-list-filetable--mixed-statuses",
		};
		const planted = { ...clone(PAIRS), pairs: [passing] };
		const failing = failingFingerprints(evaluate(planted, TOKENS_CSS));
		expect([...failing].sort()).toEqual([
			"contrast-gap|file-list-filetable--mixed-statuses|text-on-hex-ffffff-dark",
			"contrast-gap|file-list-filetable--mixed-statuses|text-on-hex-ffffff-light",
		]);
		expect(compareBaseline(failing, []).newFailures).toEqual(
			[...failing].sort(),
		);
		expect(compareBaseline(failing, []).fixedStillListed).toEqual([]);
	});

	test("shown red: a listed entry that now passes is fixed-still-listed", () => {
		const fixture: ContrastPair = {
			id: "text",
			fg: "#777777",
			on: ["#ffffff"],
			role: "text",
			selector: ".app",
			story: "file-list-filetable--mixed-statuses",
		};
		const planted = {
			...clone(PAIRS),
			pairs: [fixture],
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
			`Selector ${first.selector}: ${first.fgRef} ${first.fgHex} on the literal #9da7b6 #9da7b6 measures ${formatRatio(first.ratio)}:1 in the ${first.theme} theme (${first.role}, needs ${first.threshold}:1); v5.1 fixes it against the UI-SPEC palette.`,
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
	entries: Array<{
		name: string;
		disposition: string;
		finding?: string;
		reason?: string;
	}>;
}>(".storybook/catalog/token_map.json");
const UI_SPEC = readJson<unknown>(".storybook/catalog/ui-spec.json");
const PIN = readJson<{ commit: string }>("brand.pin.json").commit;

function codes(problems: Array<{ code: string }>): string[] {
	return problems.map((found) => found.code);
}

function records<T>(value: unknown): Array<Record<string, T>> {
	return value as Array<Record<string, T>>;
}

const ORIGINAL_REQUIRED_PLATFORM_ROLES = [
	"--ec-color-accent",
	"--ec-color-error",
	"--ec-toggle-off-track",
];

function platformDispositionProblems(
	tokenMap: typeof TOKEN_MAP,
	doc: ContrastPairsDocument,
): string[] {
	const evaluated = evaluate(doc, TOKENS_CSS);
	const overlay = new Map(
		doc.overlays.map((entry) => [entry.id, entry.layers]),
	);
	const references = new Set(
		evaluated.flatMap((result) =>
			[result.fgRef, result.bgRef, ...(overlay.get(result.bgRef) ?? [])].filter(
				(ref) => ref.startsWith("--"),
			),
		),
	);
	const problems: string[] = [];
	for (const name of ORIGINAL_REQUIRED_PLATFORM_ROLES) {
		if (!references.has(name))
			problems.push(`missing original role pair ${name}`);
	}

	const indicator = tokenMap.entries.find(
		(entry) => entry.name === PLATFORM_INDICATOR_ROLE,
	);
	const indicatorPaired = evaluated.some(
		(result) => result.fgRef === PLATFORM_INDICATOR_ROLE,
	);
	const exempt = new Set((doc.exempt ?? []).map((entry) => entry.name));
	const expectedKeepPlatform = [
		...ORIGINAL_REQUIRED_PLATFORM_ROLES,
		...(indicator === undefined ? [] : [PLATFORM_INDICATOR_ROLE]),
	].sort();
	const actualKeepPlatform = [...references]
		.filter(
			(name) =>
				tokenMap.entries.find((entry) => entry.name === name)?.disposition ===
				"keep-platform",
		)
		.sort();
	if (
		JSON.stringify(actualKeepPlatform) !== JSON.stringify(expectedKeepPlatform)
	) {
		problems.push(
			`keep-platform pairs ${JSON.stringify(actualKeepPlatform)} do not match ${JSON.stringify(expectedKeepPlatform)}`,
		);
	}

	if (indicator === undefined) {
		if (references.has(PLATFORM_INDICATOR_ROLE)) {
			problems.push("indicator is paired before its token-map declaration");
		}
		return problems;
	}
	if (indicator.disposition !== "keep-platform") {
		problems.push("declared indicator is not keep-platform");
	}
	if (exempt.has(PLATFORM_INDICATOR_ROLE)) {
		problems.push("declared indicator is exempt");
	}
	if (!indicatorPaired) {
		problems.push("declared indicator has no evaluated foreground pair");
	}
	const reason = indicator.reason ?? "";
	if (
		!/v5\.1/i.test(reason) ||
		!/focus-visible/i.test(reason) ||
		!/drop-zone/i.test(reason)
	) {
		problems.push(
			"declared indicator reason does not explain the v5.1 focus and drop-zone change",
		);
	}
	return problems;
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

	test("source-backed English hover and file-table header pairs stay distinct", () => {
		const languageCss = SHEETS["language_dropdown.css"] ?? "";
		const languageComponent = readText(
			"src/renderer/components/settings/LanguageDropdown.tsx",
		);
		const headerCss = SHEETS["file_table.css"] ?? "";
		expect(headerCss).toMatch(
			/\.file-table__header\s*\{[^}]*background:\s*var\(--ec-color-surface\)[^}]*color:\s*var\(--ec-color-text-secondary\)/s,
		);
		const englishChild = languageCss.match(
			/\.language-dropdown__english\s*\{[^}]*\}/s,
		)?.[0];
		if (englishChild === undefined)
			throw new Error("source English child rule is missing");
		const masterSource = `${englishChild}\n.language-dropdown__item:hover,\n.language-dropdown__item--focused { background: var(--ec-color-hover, rgba(0, 0, 0, 0.04)); }`;
		const paletteSource = `${englishChild}\n.language-dropdown__item:hover,\n.language-dropdown__item--focused { background: var(--ec-color-surface-hover); }`;
		const actualLayer = itemHoverLayerFromCss(languageCss, TOKENS_CSS, PAIRS);
		expect(actualLayer).not.toBeNull();
		const variants = [
			{
				languageCss,
				layer: actualLayer as string,
			},
			{
				languageCss: masterSource,
				layer: "rgba(0, 0, 0, 0.04)",
			},
			{
				languageCss: paletteSource,
				layer: "--ec-color-surface-hover",
			},
		];
		for (const variant of variants) {
			const fixture = languageHoverPairFixture(variant.layer);
			expect(pairsShapeProblems(fixture)).toEqual([]);
			expect(
				languageHoverContractProblems({
					languageComponent,
					languageCss: variant.languageCss,
					doc: fixture,
					tokensCss: TOKENS_CSS,
				}),
			).toEqual([]);
			const englishPair = fixture.pairs.find(
				(pair) => pair.id === "text-secondary",
			);
			const headerPair = fixture.pairs.find(
				(pair) => pair.id === "text-secondary-file-table-header",
			);
			if (englishPair === undefined || headerPair === undefined)
				throw new Error("English or file-table fixture pair is missing");
			expect(
				backdrops(englishPair, fixture).map((backdrop) => backdrop.ref),
			).toEqual([ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID]);
			expect(
				backdrops(headerPair, fixture).map((backdrop) => backdrop.ref),
			).toEqual([ITEM_HOVER_BASE]);

			const englishResults = evaluate(fixture, TOKENS_CSS).filter(
				(result) => result.pair === "text-secondary",
			);
			expect(englishResults).toHaveLength(4);
			for (const theme of THEMES) {
				const hoverResult = englishResults.find(
					(result) =>
						result.backdrop === ITEM_HOVER_OVERLAY_ID && result.theme === theme,
				);
				if (hoverResult === undefined)
					throw new Error(`English ${theme} item-hover result is missing`);
				const tokens = themeTokens(TOKENS_CSS);
				const base = resolveColour(ITEM_HOVER_BASE, theme, tokens, fixture);
				const layer = resolveColour(variant.layer, theme, tokens, fixture);
				if (base === null || layer === null)
					throw new Error(`English ${theme} item-hover source is unresolved`);
				const expectedBackground = flatten(layer, base);
				expect(hoverResult.selector).toBe(".language-dropdown__english");
				expect(hoverResult.bgHex).toBe(toHex(expectedBackground));
				expect(hoverResult.ratio).toBe(
					contrastRatio(colour(hoverResult.fgHex), expectedBackground),
				);
			}
		}

		const masterFixture = languageHoverPairFixture("rgba(0, 0, 0, 0.04)");
		const wrongEnglishCss = masterSource.replace(
			"color: var(--ec-color-text-secondary)",
			"color: var(--ec-color-text)",
		);
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: wrongEnglishCss,
				doc: masterFixture,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English child is not colored with text-secondary");
		const wrongForegroundPair = clone(masterFixture);
		wrongForegroundPair.pairs.find((pair) => pair.id === "text-secondary")!.fg =
			"--ec-color-text";
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: masterSource,
				doc: wrongForegroundPair,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English pair foreground is not text-secondary");
		const wrongParentCss = masterSource.replace(
			".language-dropdown__item:hover,",
			".language-dropdown__trigger:hover,",
		);
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: wrongParentCss,
				doc: masterFixture,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English item hover parent selector is missing");
		const wrongPairSelector = clone(masterFixture);
		wrongPairSelector.pairs.find(
			(pair) => pair.id === "text-secondary",
		)!.selector = ".language-dropdown__trigger";
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: masterSource,
				doc: wrongPairSelector,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English pair selector does not identify its source child");
		const missingOverlay = clone(masterFixture);
		missingOverlay.overlays = missingOverlay.overlays.filter(
			(entry) => entry.id !== ITEM_HOVER_OVERLAY_ID,
		);
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: masterSource,
				doc: missingOverlay,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English item-hover overlay is missing");
		const unresolvedSemantic = languageHoverPairFixture(
			"--ec-color-surface-hover",
		);
		delete unresolvedSemantic.localTokens["--ec-color-surface-hover"];
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: paletteSource,
				doc: unresolvedSemantic,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English item hover background is unsupported or unresolved");
		const unsupportedSemanticCss = paletteSource.replace(
			"var(--ec-color-surface-hover)",
			"var(--ec-color-surface-hover-alt)",
		);
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: unsupportedSemanticCss,
				doc: languageHoverPairFixture("--ec-color-surface-hover"),
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English item hover background is unsupported or unresolved");
		const mismatchedBackdrop = clone(masterFixture);
		mismatchedBackdrop.overlays.find(
			(entry) => entry.id === ITEM_HOVER_OVERLAY_ID,
		)!.layers[1] = "rgba(0, 0, 0, 0.08)";
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: masterSource,
				doc: mismatchedBackdrop,
				tokensCss: TOKENS_CSS,
			}),
		).toContain("English item-hover overlay does not match its parent paint");

		if (
			TOKEN_MAP.entries.some((entry) => entry.name === PLATFORM_INDICATOR_ROLE)
		) {
			const realEnglishPair = PAIRS.pairs.find(
				(pair) => pair.id === "text-secondary",
			);
			const realHeaderPair = PAIRS.pairs.find(
				(pair) => pair.id === "text-secondary-file-table-header",
			);
			expect(realEnglishPair).toMatchObject({
				selector: ".language-dropdown__english",
				on: ["--ec-color-surface", "item-hover"],
				story: "settings-languagedropdown--item-hover",
			});
			expect(realHeaderPair).toMatchObject({
				selector: ".file-table__header",
				on: ["--ec-color-surface"],
				story: "file-list-filetable--mixed-statuses",
			});
		}
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
		const planted = `:root { --ec-color-planted: #123456; }
[data-theme="dark"] { --ec-color-planted: #654321; }`;
		expect(planted.match(/--ec-color-planted/g)).toHaveLength(2);
		const found = g1Problems(planted, {
			surfaces: [],
			overlays: [],
			localTokens: {},
			pairs: [],
			exempt: [],
		});
		expect(codes(found)).toEqual(["g1-uncovered-token"]);
		expect(found[0]?.message).toContain("--ec-color-planted");
	});

	test("shown red: a light colour token the dark block does not define", () => {
		const planted = ":root { --ec-color-planted: #123456; }";
		const found = g1Problems(planted, {
			surfaces: [],
			overlays: [],
			localTokens: {},
			pairs: [],
			exempt: [{ name: "--ec-color-planted", reason: "fixture coverage" }],
		});
		expect(codes(found)).toEqual(["g1-missing-dark"]);
		expect(found[0]?.message).toContain("--ec-color-planted");
	});

	test("an alias is judged through its target, never on its own", () => {
		const planted = `:root { --ec-color-bg: #ffffff; --color-bg: var(--ec-color-bg); --color-bg-twin: var(--ec-color-bg); }
[data-theme="dark"] { --ec-color-bg: #000000; --color-bg: var(--ec-color-bg); --color-bg-twin: var(--ec-color-bg); }`;
		expect(
			g1Problems(planted, {
				surfaces: ["--ec-color-bg"],
				overlays: [],
				localTokens: {},
				pairs: [],
				exempt: [],
			}),
		).toEqual([]);
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
		varReferences(names);
		varReferences(calls);
		expect(Date.now() - started).toBeLessThan(1000);
	});

	test("a 200 KB declaration through the whole of G2 stays linear too", () => {
		const sheets = {
			"planted.css": `.a { color: ${"var(".repeat(50_000)}; background: ${"rgba(".repeat(40_000)}; border: ${"#".repeat(100_000)}; }`,
		};
		const started = Date.now();
		g2Report(sheets, PAIRS, TOKENS_CSS, TOKEN_MAP);
		expect(Date.now() - started).toBeLessThan(2000);
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
		const entry = records<string>(doc.exempt).find(
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
		const entry = records<string>(doc.exempt).find(
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
		const entry = records<unknown>(doc.exempt)[0];
		if (entry === undefined) throw new Error("no exempt entry");
		entry["why"] = "extra";
		expect(codes(pairsShapeProblems(doc))).toEqual(["pairs-shape"]);
	});

	test("shown red: a literal that names no pair, and a duplicate pair id", () => {
		const doc = clone(PAIRS);
		const literal = records<unknown>(doc.literals).find(
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

// ---------------------------------------------------------------------------
// The sealed baseline (D-24, D-25): the failing set and the `contrast-gap` entries
// of docs/evidence/known-findings.json are the same set, both ways. A failure with
// no entry is a new failure; an entry whose pair now passes is the shrink and must
// be removed. v5.1 removes these entries together with the axe symptom entries.
// ---------------------------------------------------------------------------

const BASELINE_CONTROL_PAIRS: ContrastPairsDocument = {
	surfaces: [],
	overlays: [],
	localTokens: {},
	pairs: [
		{
			id: "control-text",
			fg: "#777777",
			on: ["#ffffff"],
			role: "text",
			selector: ".fixture__text",
			story: "fixture--contrast-baseline",
		},
		{
			id: "control-non-text",
			fg: "#222222",
			on: ["#333333"],
			role: "non-text",
			selector: ".fixture__icon",
			story: "fixture--contrast-baseline",
		},
	],
};
const BASELINE_CONTROL_RESULTS = evaluate(BASELINE_CONTROL_PAIRS, "");
const BASELINE_CONTROL_FAILING = failingFingerprints(BASELINE_CONTROL_RESULTS);
const BASELINE_CONTROL_ENTRIES = BASELINE_CONTROL_RESULTS.filter(
	(result) => !result.pass,
).map(contrastGapEntry);

describe("the real baseline holds exactly today's contrast failures", () => {
	const results = evaluate(PAIRS, TOKENS_CSS);
	const failing = failingFingerprints(results);
	const entries = BASELINE.entries.filter((e) => e.kind === "contrast-gap");

	test("a new failure is red and a fixed pair still listed is red", () => {
		const { newFailures, fixedStillListed } = compareBaseline(
			failing,
			BASELINE.entries,
		);
		expect(
			newFailures,
			`a failing pair has no contrast-gap entry; the kind is sealed, so fix the pair instead of listing it: ${newFailures.join(", ")}`,
		).toEqual([]);
		expect(
			fixedStillListed,
			`these contrast-gap entries now pass; remove the entry: ${fixedStillListed.join(", ")}`,
		).toEqual([]);
		expect(entries).toHaveLength(failing.size);
	});

	test("shown red: dropping an entry makes its failure new, and a stale entry is fixed-still-listed", () => {
		const [dropped] = BASELINE_CONTROL_ENTRIES;
		if (dropped === undefined)
			throw new Error("no synthetic contrast-gap entry");
		const without = BASELINE_CONTROL_ENTRIES.filter(
			(entry) => entry.fingerprint !== dropped.fingerprint,
		);
		expect(
			compareBaseline(BASELINE_CONTROL_FAILING, without).newFailures,
		).toEqual([dropped.fingerprint]);
		const stale = [
			...BASELINE_CONTROL_ENTRIES,
			{ ...dropped, fingerprint: `${dropped.fingerprint}-gone` },
		];
		expect(
			compareBaseline(BASELINE_CONTROL_FAILING, stale).fixedStillListed,
		).toEqual([`${dropped.fingerprint}-gone`]);
	});

	test("synthetic controls cover both themes and text/non-text failure roles", () => {
		expect(
			new Set(BASELINE_CONTROL_RESULTS.map((result) => result.theme)),
		).toEqual(new Set(["light", "dark"]));
		expect(
			new Set(
				BASELINE_CONTROL_RESULTS.filter((result) => !result.pass).map(
					(result) => result.role,
				),
			),
		).toEqual(new Set(["text", "non-text"]));
		expect(
			compareBaseline(BASELINE_CONTROL_FAILING, BASELINE_CONTROL_ENTRIES),
		).toEqual({ newFailures: [], fixedStillListed: [] });
		expect(compareBaseline(new Set<string>(), [])).toEqual({
			newFailures: [],
			fixedStillListed: [],
		});
	});

	test("every entry quotes the measured ratio and theme, its pair's story, major and fix-v5.1", () => {
		const byFingerprint = new Map(results.map((r) => [r.fingerprint, r]));
		for (const entry of entries) {
			const result = byFingerprint.get(entry.fingerprint);
			expect(result, entry.fingerprint).toBeDefined();
			if (result === undefined) continue;
			expect(entry.reason, entry.fingerprint).toContain(
				`measures ${formatRatio(result.ratio)}:1`,
			);
			expect(entry.reason, entry.fingerprint).toContain(
				`in the ${result.theme} theme`,
			);
			expect(entry.reason, entry.fingerprint).toContain(result.fgHex);
			expect(entry.reason, entry.fingerprint).toContain(result.bgHex);
			expect(entry.story).toBe(result.story);
			expect(entry.rule).toBe(result.rule);
			expect(entry.severity).toBe("major");
			expect(entry.disposition).toBe("fix-v5.1");
			expect(entry.fingerprint).toBe(
				`contrast-gap|${entry.story}|${entry.rule}`,
			);
			expect(entry.rule.startsWith("a11y")).toBe(false);
		}
	});

	test("the entries are the evaluator's own reasons, so a reason cannot go stale", () => {
		const byFingerprint = new Map(results.map((r) => [r.fingerprint, r]));
		for (const entry of entries) {
			const result = byFingerprint.get(entry.fingerprint);
			if (result === undefined) throw new Error(entry.fingerprint);
			expect(entry).toEqual(contrastGapEntry(result));
		}
	});

	test("real pair checks cover both themes and keep the thresholds", () => {
		expect(new Set(results.map((r) => r.theme))).toEqual(
			new Set(["light", "dark"]),
		);
		expect(new Set(results.map((r) => r.role))).toEqual(
			new Set(["text", "non-text", "focus"]),
		);
		for (const result of results) {
			expect(result.threshold).toBe(THRESHOLDS[result.role]);
			expect(result.pass).toBe(result.ratio >= result.threshold);
		}
		const failed = results.filter((r) => !r.pass);
		expect(failed.filter((r) => r.role === "focus")).toEqual([]);
	});

	test("no kind of the baseline is an axe kind unless it is a11y or a11y-pN", () => {
		for (const kind of Object.keys(BASELINE.kinds)) {
			if (kind.startsWith("a11y")) {
				expect(kind, kind).toMatch(/^a11y(-p\d+)?$/);
			}
		}
		expect(BASELINE.kinds["contrast-gap"]).toEqual({ sealed: true });
		expect(BASELINE.kinds["token-map-gap"]).toEqual({ sealed: true });
		const kinds = Object.keys(BASELINE.kinds);
		expect(kinds).toEqual([...kinds].sort());
	});

	test("the real-tree platform roles keep the original required set", () => {
		const exempt = new Set((PAIRS.exempt ?? []).map((entry) => entry.name));
		const overlay = new Map(PAIRS.overlays.map((o) => [o.id, o.layers]));
		const tokensOf = (result: (typeof results)[number]) =>
			[result.fgRef, result.bgRef, ...(overlay.get(result.bgRef) ?? [])].filter(
				(ref) => ref.startsWith("--"),
			);
		const inPairs = new Set(results.flatMap((r) => tokensOf(r)));
		for (const name of exempt) {
			expect(
				results.filter((r) => !r.pass).some((r) => tokensOf(r).includes(name)),
				`${name} is exempt and in a failing pair`,
			).toBe(false);
		}
		expect(platformDispositionProblems(TOKEN_MAP, PAIRS)).toEqual([]);
	});

	test("platform indicator declaration has paired, documented and non-exempt controls in both states", () => {
		const absentMap = clone(TOKEN_MAP);
		absentMap.entries = absentMap.entries.filter(
			(entry) => entry.name !== PLATFORM_INDICATOR_ROLE,
		);

		const paletteLikePairs = withoutPlatformIndicatorReferences(PAIRS);
		paletteLikePairs.localTokens[PLATFORM_INDICATOR_ROLE] = {
			light: "#007AFF",
			dark: "#1A87FF",
		};
		paletteLikePairs.pairs.push({
			id: "platform-indicator-contract",
			fg: PLATFORM_INDICATOR_ROLE,
			on: ["--ec-color-surface"],
			role: "focus",
			selector: ".segmented-control__segment:focus-visible",
			story: "controls-segmentedcontrol--keyboard-focus",
		});
		const absentPairs = withoutPlatformIndicatorReferences(paletteLikePairs);
		expect(platformDispositionProblems(absentMap, absentPairs)).toEqual([]);
		expect(platformDispositionProblems(absentMap, paletteLikePairs)).toContain(
			"indicator is paired before its token-map declaration",
		);

		const validReason =
			"v5.1 keeps the platform-owned indicator for focus-visible and drop-zone boundaries.";
		const presentMap = clone(absentMap);
		presentMap.entries.push({
			name: PLATFORM_INDICATOR_ROLE,
			disposition: "keep-platform",
			reason: validReason,
		});
		const presentPairs = clone(paletteLikePairs);
		const fixtureResults = evaluate(presentPairs, TOKENS_CSS);
		expect(
			fixtureResults.some((result) => result.fgRef === PLATFORM_INDICATOR_ROLE),
		).toBe(true);
		expect(platformDispositionProblems(presentMap, presentPairs)).toEqual([]);

		const unpairedProblems = platformDispositionProblems(
			presentMap,
			absentPairs,
		);
		expect(unpairedProblems).toContain(
			"declared indicator has no evaluated foreground pair",
		);

		const misclassifiedMap = clone(presentMap);
		const misclassified = misclassifiedMap.entries.find(
			(entry) => entry.name === PLATFORM_INDICATOR_ROLE,
		);
		if (misclassified === undefined)
			throw new Error("indicator fixture is missing");
		misclassified.disposition = "adopt";
		expect(
			platformDispositionProblems(misclassifiedMap, presentPairs),
		).toContain("declared indicator is not keep-platform");

		const unexplainedMap = clone(presentMap);
		const unexplained = unexplainedMap.entries.find(
			(entry) => entry.name === PLATFORM_INDICATOR_ROLE,
		);
		if (unexplained === undefined)
			throw new Error("indicator fixture is missing");
		unexplained.reason = "Platform-owned indicator role.";
		expect(platformDispositionProblems(unexplainedMap, presentPairs)).toContain(
			"declared indicator reason does not explain the v5.1 focus and drop-zone change",
		);

		const exemptPairs = clone(presentPairs);
		exemptPairs.exempt = [
			...(exemptPairs.exempt ?? []),
			{ name: PLATFORM_INDICATOR_ROLE, reason: "fixture exemption" },
		];
		expect(platformDispositionProblems(presentMap, exemptPairs)).toContain(
			"declared indicator is exempt",
		);

		const lostOriginalRoleMap = clone(absentMap);
		lostOriginalRoleMap.entries = lostOriginalRoleMap.entries.filter(
			(entry) => entry.name !== "--ec-color-accent",
		);
		expect(
			platformDispositionProblems(lostOriginalRoleMap, absentPairs).some(
				(problem) => problem.includes("--ec-color-accent"),
			),
		).toBe(true);
	});

	test("token-map gaps follow their source and each remaining gap has one map entry", () => {
		const source = readText("src/renderer/styles/empty_state.css");
		expect(
			tokenMapGapProblems(BASELINE.entries, TOKEN_MAP.entries, source),
		).toEqual([]);
	});

	test("gap contract fixtures retain unresolved gaps and allow a fixed semantic empty-state role", () => {
		const lineHeight = tokenMapGapFixture("line-height");
		const emptyState = tokenMapGapFixture("empty-state");
		const hardcodedSource = [
			".empty-state { --empty-state-secondary: #59677b; }",
			".empty-state__icon { color: var(--empty-state-secondary); }",
			'[data-theme="dark"] .empty-state { --empty-state-secondary: #94949b; }',
		].join("\n");
		const semanticSource =
			".empty-state__icon { color: var(--ec-color-text-secondary); }";
		const currentMap = [
			{ name: "--ec-line-height-normal", finding: lineHeight.fingerprint },
			{ name: "--empty-state-secondary", finding: emptyState.fingerprint },
		];

		expect(
			tokenMapGapProblems(
				[lineHeight, emptyState],
				currentMap,
				hardcodedSource,
			),
		).toEqual([]);
		expect(
			tokenMapGapProblems([lineHeight], [currentMap[0]!], semanticSource),
		).toEqual([]);
	});

	test("gap contract fixtures reject a missing required unresolved line-height finding", () => {
		const lineHeight = tokenMapGapFixture("line-height");
		const problems = tokenMapGapProblems(
			[],
			[],
			".empty-state__icon { color: var(--ec-color-text-secondary); }",
		);
		expect(problems).toContain(
			`missing required gap ${lineHeight.fingerprint}`,
		);
	});

	test("gap contract fixtures reject a stale fixed empty-state finding", () => {
		const lineHeight = tokenMapGapFixture("line-height");
		const emptyState = tokenMapGapFixture("empty-state");
		const problems = tokenMapGapProblems(
			[lineHeight, emptyState],
			[
				{ name: "--ec-line-height-normal", finding: lineHeight.fingerprint },
				{ name: "--empty-state-secondary", finding: emptyState.fingerprint },
			],
			".empty-state__icon { color: var(--ec-color-text-secondary); }",
		);
		expect(problems).toContain(`unexpected gap ${emptyState.fingerprint}`);
	});

	test("gap contract fixtures reject orphan and duplicate map links", () => {
		const lineHeight = tokenMapGapFixture("line-height");
		const emptyState = tokenMapGapFixture("empty-state");
		const source = [
			".empty-state { --empty-state-secondary: #59677b; }",
			".empty-state__icon { color: var(--empty-state-secondary); }",
		].join("\n");
		const orphan = tokenMapGapProblems(
			[lineHeight],
			[
				{ name: "--ec-line-height-normal", finding: lineHeight.fingerprint },
				{ name: "--orphan", finding: "token-map-gap|orphan|source-missing" },
			],
			source,
		);
		expect(orphan).toContain(
			"orphan map link token-map-gap|orphan|source-missing",
		);

		const duplicate = tokenMapGapProblems(
			[lineHeight, emptyState],
			[
				{ name: "--ec-line-height-normal", finding: lineHeight.fingerprint },
				{ name: "--empty-state-secondary", finding: emptyState.fingerprint },
				{ name: "--duplicate-empty-state", finding: emptyState.fingerprint },
			],
			source,
		);
		expect(duplicate).toContain(
			`gap ${emptyState.fingerprint} has 2 map links`,
		);
	});
});

type TokenMapGapEntry = {
	fingerprint: string;
	kind: string;
	story: string;
	rule: string;
	disposition: string;
	severity?: string;
};

type TokenMapGapLink = { name: string; finding?: string };

const LINE_HEIGHT_GAP = {
	fingerprint:
		"token-map-gap|file-list-filerow--copy-mode-disclosure|line-height-token-undefined",
	story: "file-list-filerow--copy-mode-disclosure",
	rule: "line-height-token-undefined",
};
const EMPTY_STATE_GAP = {
	fingerprint:
		"token-map-gap|ui-emptystate--copy-mode-on|empty-state-secondary-hardcoded",
	story: "ui-emptystate--copy-mode-on",
	rule: "empty-state-secondary-hardcoded",
};

function tokenMapGapFixture(
	which: "line-height" | "empty-state",
): TokenMapGapEntry {
	const gap = which === "line-height" ? LINE_HEIGHT_GAP : EMPTY_STATE_GAP;
	return {
		...gap,
		kind: "token-map-gap",
		disposition: "fix-v5.1",
		severity: "minor",
	};
}

function tokenMapGapProblems(
	baselineEntries: TokenMapGapEntry[],
	tokenMapEntries: TokenMapGapLink[],
	emptyStateCss: string,
): string[] {
	const gaps = baselineEntries.filter(
		(entry) => entry.kind === "token-map-gap",
	);
	const hardcodedSecondary =
		/--empty-state-secondary\s*:\s*#[\da-f]{3,8}\b/i.test(emptyStateCss) &&
		/var\(\s*--empty-state-secondary\s*\)/i.test(emptyStateCss);
	const expected = [
		LINE_HEIGHT_GAP,
		...(hardcodedSecondary ? [EMPTY_STATE_GAP] : []),
	];
	const expectedFingerprints = new Set(expected.map((gap) => gap.fingerprint));
	const problems: string[] = [];

	for (const gap of expected) {
		const matches = gaps.filter(
			(entry) => entry.fingerprint === gap.fingerprint,
		);
		if (matches.length === 0)
			problems.push(`missing required gap ${gap.fingerprint}`);
		if (matches.length > 1) problems.push(`duplicate gap ${gap.fingerprint}`);
		for (const entry of matches) {
			if (
				entry.story !== gap.story ||
				entry.rule !== gap.rule ||
				entry.disposition !== "fix-v5.1" ||
				entry.severity !== "minor"
			) {
				problems.push(`gap metadata changed ${gap.fingerprint}`);
			}
		}
	}

	for (const gap of gaps) {
		if (!expectedFingerprints.has(gap.fingerprint)) {
			problems.push(`unexpected gap ${gap.fingerprint}`);
		}
	}

	const links = tokenMapEntries.filter((entry) =>
		entry.finding?.startsWith("token-map-gap|"),
	);
	for (const fingerprint of expectedFingerprints) {
		const count = links.filter((entry) => entry.finding === fingerprint).length;
		if (count !== 1) problems.push(`gap ${fingerprint} has ${count} map links`);
	}
	for (const link of links) {
		if (link.finding !== undefined && !expectedFingerprints.has(link.finding)) {
			problems.push(`orphan map link ${link.finding}`);
		}
	}
	return problems;
}
