import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { cssDeclarations } from "../../../.storybook/catalog/css_scan.mjs";
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

type EvaluatedContrast = ReturnType<typeof evaluate>[number];

function declaredTextTraceProblems(
	pair: ContrastPair | undefined,
	doc: ContrastPairsDocument,
	results: EvaluatedContrast[],
	requirePassing = false,
): string[] {
	if (pair === undefined) return ["text-secondary pair is missing"];

	const expected = new Map<string, { rule: string; fingerprint: string }>();
	for (const backdrop of backdrops(pair, doc)) {
		for (const theme of THEMES) {
			const rule = `${pair.id}-on-${backdrop.short}-${theme}`;
			expected.set(`${theme}|${backdrop.ref}`, {
				rule,
				fingerprint: `contrast-gap|${pair.story}|${rule}`,
			});
		}
	}

	const problems: string[] = [];
	const seenResults = new Set<string>();
	const seenFingerprints = new Set<string>();
	for (const result of results.filter(
		(candidate) => candidate.pair === pair.id,
	)) {
		const key = `${result.theme}|${result.bgRef}`;
		const expectedResult = expected.get(key);
		if (expectedResult === undefined) {
			problems.push(`unexpected declared backdrop/theme ${key}`);
		} else if (seenResults.has(key)) {
			problems.push(`duplicate declared result ${key}`);
		} else {
			seenResults.add(key);
		}

		if (seenFingerprints.has(result.fingerprint)) {
			problems.push(`duplicate result fingerprint ${result.fingerprint}`);
		}
		seenFingerprints.add(result.fingerprint);
		if (
			expectedResult !== undefined &&
			(result.rule !== expectedResult.rule ||
				result.fingerprint !== expectedResult.fingerprint)
		) {
			problems.push(`unexpected rule or fingerprint for ${key}`);
		}
		if (
			!Number.isFinite(result.ratio) ||
			result.threshold !== THRESHOLDS[pair.role] ||
			result.pass !== result.ratio >= result.threshold
		) {
			problems.push(`invalid text threshold result for ${key}`);
		}
		if (requirePassing && !result.pass) {
			problems.push(`text threshold failed for ${key}`);
		}
	}

	for (const key of expected.keys()) {
		if (!seenResults.has(key)) problems.push(`missing declared result ${key}`);
	}
	return problems;
}

function declaredBackdropTracerFixture(
	englishOn: string | string[],
): ContrastPairsDocument {
	return {
		surfaces: ["--ec-color-bg", "--ec-color-surface"],
		overlays: [
			{
				id: ITEM_HOVER_OVERLAY_ID,
				layers: [ITEM_HOVER_BASE, "rgba(0, 0, 0, 0.04)"],
			},
		],
		localTokens: {},
		pairs: [
			{
				id: "text-secondary",
				fg: ITEM_HOVER_ENGLISH_ROLE,
				on: englishOn,
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
		],
	};
}

const DECLARED_BACKDROP_FIXTURE_TOKENS = `:root {
	--ec-color-bg: #ffffff;
	--ec-color-surface: #ffffff;
	--ec-color-text-secondary: #000000;
}
[data-theme="dark"] {
	--ec-color-bg: #000000;
	--ec-color-surface: #000000;
	--ec-color-text-secondary: #ffffff;
}`;

const PLATFORM_INDICATOR_ROLE = "--ec-color-platform-indicator";
const ITEM_HOVER_OVERLAY_ID = "item-hover";
const ITEM_HOVER_BASE = "--ec-color-surface";
const ITEM_HOVER_ENGLISH_ROLE = "--ec-color-text-secondary";
const PALETTE_HOVER_TEST_COLORS = {
	light: "#DCE6E5",
	dark: "#2E5753",
};

function paletteHoverTokensCss(tokensCss: string): string {
	const tokens = themeTokens(tokensCss);
	if (THEMES.every((theme) => tokens[theme].has("--ec-color-surface-hover"))) {
		return tokensCss;
	}
	return `${tokensCss}\n:root { --ec-color-surface-hover: ${PALETTE_HOVER_TEST_COLORS.light}; }\n[data-theme="dark"] { --ec-color-surface-hover: ${PALETTE_HOVER_TEST_COLORS.dark}; }`;
}

function itemHoverPaintFromCss(languageCss: string): string | null {
	const rules = [
		...languageCss.matchAll(
			/^[\t ]*([^{}]*\.language-dropdown__item[^{}]*)\{([^{}]*)\}/gm,
		),
	];
	const hoverRules = rules.filter((rule) =>
		/\.language-dropdown__item(?::hover|--focused)/.test(rule[1] ?? ""),
	);
	if (hoverRules.length !== 1) return null;
	const selectors = (hoverRules[0]?.[1] ?? "")
		.split(",")
		.map((selector) => selector.trim());
	if (
		JSON.stringify(selectors) !==
		JSON.stringify([
			".language-dropdown__item:hover",
			".language-dropdown__item--focused",
		])
	) {
		return null;
	}
	const backgrounds = [
		...(hoverRules[0]?.[2] ?? "").matchAll(
			/(?:^|;)\s*background\s*:\s*([^;]+)\s*;?/g,
		),
	];
	if (backgrounds.length !== 1) return null;
	return backgrounds[0]?.[1]?.trim().replace(/\s+/g, " ") ?? null;
}

function itemHoverLayerFromCss(
	languageCss: string,
	tokensCss: string,
	doc: ContrastPairsDocument,
): string | null {
	const value = itemHoverPaintFromCss(languageCss);
	if (value === null) return null;
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

type FixtureSchemaState = "legacy" | "source-owned";

type FixtureSourceUse = {
	file: string;
	selector: string;
	property: string;
};

type FixtureLiteral = {
	value: string;
	files: string[];
	pair?: string;
	exempt?: string;
	uses?: FixtureSourceUse[];
};

type FixtureExemption = {
	name: string;
	reason: string;
	fill?: string;
	classification?: "no-information";
	sourceUses?: FixtureSourceUse[];
};

type HoverFixtureDocument = Omit<
	ContrastPairsDocument,
	"exempt" | "literals"
> & {
	exempt?: FixtureExemption[];
	literals?: FixtureLiteral[];
};

function hasOwnKey(value: object, key: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

const HOVER_FIXTURE_SOURCE_USE: FixtureSourceUse = {
	file: "language_dropdown.css",
	selector: ".language-dropdown__item:hover, .language-dropdown__item--focused",
	property: "background",
};

const NO_INFORMATION_FIXTURE_SOURCES: Record<string, FixtureSourceUse> = {
	"--ec-border-status-bar": {
		file: "status_bar.css",
		selector: ".status-bar",
		property: "border-top",
	},
	"--ec-shadow-drawer": {
		file: "settings_drawer.css",
		selector: ".settings-drawer",
		property: "box-shadow",
	},
};

function fixtureSchemaProblems(
	doc: ContrastPairsDocument,
	state: FixtureSchemaState,
): string[] {
	const sourceDoc = doc as HoverFixtureDocument;
	const problems: string[] = [];
	const expectedNoInformationNames = Object.keys(
		NO_INFORMATION_FIXTURE_SOURCES,
	).sort();
	const noInformation = (sourceDoc.exempt ?? []).filter((entry) =>
		expectedNoInformationNames.includes(entry.name),
	);
	const actualNoInformationNames = noInformation
		.map((entry) => entry.name)
		.sort();
	if (
		JSON.stringify(actualNoInformationNames) !==
		JSON.stringify(expectedNoInformationNames)
	) {
		problems.push("the exact no-information exemption identities are missing");
	}

	for (const entry of noInformation) {
		if (!/carries no information/i.test(entry.reason)) {
			problems.push(`${entry.name} lost its no-information reason`);
		}
		if (state === "source-owned") {
			const expected = NO_INFORMATION_FIXTURE_SOURCES[entry.name];
			if (entry.classification !== "no-information") {
				problems.push(`${entry.name} lacks its source-owned classification`);
			}
			if (
				JSON.stringify(entry.sourceUses) !==
				JSON.stringify(expected ? [expected] : [])
			) {
				problems.push(`${entry.name} has incomplete source ownership`);
			}
		} else if (
			hasOwnKey(entry, "classification") ||
			hasOwnKey(entry, "sourceUses")
		) {
			problems.push(`${entry.name} adds metadata to the closed legacy shape`);
		}
	}

	for (const entry of sourceDoc.exempt ?? []) {
		if (
			!expectedNoInformationNames.includes(entry.name) &&
			(hasOwnKey(entry, "classification") || hasOwnKey(entry, "sourceUses"))
		) {
			problems.push(`${entry.name} has unsupported no-information metadata`);
		}
	}

	for (const literal of sourceDoc.literals ?? []) {
		if (state === "legacy") {
			if (hasOwnKey(literal, "uses")) {
				problems.push(`${literal.value} adds uses to the closed legacy shape`);
			}
			continue;
		}
		const uses = literal.uses;
		if (!Array.isArray(uses) || uses.length === 0) {
			problems.push(`${literal.value} lacks source-owned uses`);
			continue;
		}
		const seen = new Set<string>();
		for (const use of uses) {
			if (
				!use.file.endsWith(".css") ||
				use.selector.trim() === "" ||
				use.property.trim() === "" ||
				use.property !== use.property.toLowerCase()
			) {
				problems.push(`${literal.value} has an incomplete source-use record`);
				continue;
			}
			const key = JSON.stringify([use.file, use.selector, use.property]);
			if (seen.has(key))
				problems.push(`${literal.value} duplicates a source use`);
			seen.add(key);
		}
		const files = [...new Set(uses.map((use) => use.file))].sort();
		if (JSON.stringify([...literal.files].sort()) !== JSON.stringify(files)) {
			problems.push(`${literal.value} files do not match its source uses`);
		}
	}
	return problems;
}

function fixtureSchemaState(
	doc: ContrastPairsDocument,
): FixtureSchemaState | null {
	const validStates = (["legacy", "source-owned"] as const).filter(
		(state) => fixtureSchemaProblems(doc, state).length === 0,
	);
	return validStates.length === 1 ? (validStates[0] ?? null) : null;
}

function hoverFixtureMetadataProblems(
	doc: ContrastPairsDocument,
	state: FixtureSchemaState,
): string[] {
	const problems = fixtureSchemaProblems(doc, state);
	const sourceDoc = doc as HoverFixtureDocument;
	for (const literal of sourceDoc.literals ?? []) {
		if (
			literal.value !== LEGACY_HOVER_FALLBACK &&
			literal.value !== "#ffffff"
		) {
			problems.push(`${literal.value} is not a declared hover-fixture literal`);
			continue;
		}
		if (literal.pair !== "text-secondary") {
			problems.push(`${literal.value} is not owned by the English pair`);
		}
		if (
			state === "source-owned" &&
			JSON.stringify(literal.uses) !==
				JSON.stringify([HOVER_FIXTURE_SOURCE_USE])
		) {
			problems.push(`${literal.value} does not name its exact CSS declaration`);
		}
		if (
			state === "legacy" &&
			JSON.stringify(literal.files) !==
				JSON.stringify([HOVER_FIXTURE_SOURCE_USE.file])
		) {
			problems.push(`${literal.value} does not name its legacy CSS file`);
		}
	}
	return problems;
}

function hoverFixtureLiteral(
	value: string,
	state: FixtureSchemaState,
): FixtureLiteral {
	return state === "source-owned"
		? {
				value,
				files: [HOVER_FIXTURE_SOURCE_USE.file],
				uses: [{ ...HOVER_FIXTURE_SOURCE_USE }],
				pair: "text-secondary",
			}
		: {
				value,
				files: [HOVER_FIXTURE_SOURCE_USE.file],
				pair: "text-secondary",
			};
}

function noInformationFixtureExemptions(
	exemptions: FixtureExemption[],
	state: FixtureSchemaState,
): FixtureExemption[] {
	const expectedNames = new Set(Object.keys(NO_INFORMATION_FIXTURE_SOURCES));
	const actualNames = exemptions
		.filter((entry) => expectedNames.has(entry.name))
		.map((entry) => entry.name)
		.sort();
	if (
		JSON.stringify(actualNames) !== JSON.stringify([...expectedNames].sort())
	) {
		throw new Error(
			"ambient pairs document lacks its exact no-information entries",
		);
	}
	return exemptions.map((entry) => {
		if (!expectedNames.has(entry.name)) return entry;
		if (state === "legacy") {
			const legacyEntry = { ...entry };
			delete legacyEntry.classification;
			delete legacyEntry.sourceUses;
			return legacyEntry;
		}
		const sourceUse = NO_INFORMATION_FIXTURE_SOURCES[entry.name];
		if (sourceUse === undefined)
			throw new Error(`missing source use for ${entry.name}`);
		return {
			...entry,
			classification: "no-information",
			sourceUses: [{ ...sourceUse }],
		};
	});
}

function languageHoverPairFixture(
	hoverLayer: string,
	ambientDoc: ContrastPairsDocument = PAIRS,
	requestedState: FixtureSchemaState | undefined = undefined,
): ContrastPairsDocument {
	const state = requestedState ?? fixtureSchemaState(ambientDoc);
	if (state === null || state === undefined) {
		throw new Error("ambient pairs document has mixed or incomplete metadata");
	}
	const fixture = clone(ambientDoc) as HoverFixtureDocument;
	fixture.surfaces = [ITEM_HOVER_BASE];
	fixture.overlays = [
		{
			id: ITEM_HOVER_OVERLAY_ID,
			layers: [ITEM_HOVER_BASE, hoverLayer],
		},
	];
	fixture.localTokens =
		hoverLayer === SURFACE_HOVER_TOKEN
			? { [hoverLayer]: { ...PALETTE_HOVER_TEST_COLORS } }
			: {};
	fixture.pairs = [
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
	];
	fixture.literals =
		hoverLayer === LEGACY_HOVER_FALLBACK
			? [hoverFixtureLiteral(LEGACY_HOVER_FALLBACK, state)]
			: [];
	fixture.exempt = noInformationFixtureExemptions(fixture.exempt ?? [], state);
	fixture.proposed = [];
	fixture.brandRatios = [];
	return fixture as ContrastPairsDocument;
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

	test("the real pair is evaluated on exactly its declared backdrops in both themes", () => {
		expect(tracer).toBeDefined();
		if (tracer === undefined) throw new Error("text-secondary pair is missing");
		const allResults = evaluate(PAIRS, TOKENS_CSS);
		const results = allResults.filter((result) => result.pair === tracer.id);
		const expected = backdrops(tracer, PAIRS).flatMap(({ ref }) =>
			THEMES.map((theme) => `${theme}|${ref}`),
		);
		expect(results.map((result) => `${result.theme}|${result.bgRef}`)).toEqual(
			expected,
		);
		expect(declaredTextTraceProblems(tracer, PAIRS, allResults)).toEqual([]);
		for (const result of results) {
			expect(Number.isFinite(result.ratio), result.rule).toBe(true);
			expect(result.fingerprint).toBe(
				`contrast-gap|${result.story}|${result.rule}`,
			);
		}
		const light = results.find((result) => result.theme === "light");
		expect(light).toBeDefined();
		if (light === undefined) throw new Error("light tracer result is missing");
		expect(light.threshold).toBe(THRESHOLDS.text);
		expect(light.pass).toBe(light.ratio >= light.threshold);
	});

	test("legacy global surfaces and palette English/header declarations have truthful fixtures", () => {
		const fixtures = [
			{
				name: "legacy global surfaces",
				doc: declaredBackdropTracerFixture("surfaces"),
				englishBackdrops: ["--ec-color-bg", "--ec-color-surface"],
			},
			{
				name: "palette English surface and item-hover",
				doc: declaredBackdropTracerFixture([
					ITEM_HOVER_BASE,
					ITEM_HOVER_OVERLAY_ID,
				]),
				englishBackdrops: [ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID],
			},
		];

		for (const fixture of fixtures) {
			const englishPair = fixture.doc.pairs.find(
				(pair) => pair.id === "text-secondary",
			);
			const headerPair = fixture.doc.pairs.find(
				(pair) => pair.id === "text-secondary-file-table-header",
			);
			expect(englishPair, fixture.name).toBeDefined();
			expect(headerPair, fixture.name).toBeDefined();
			if (englishPair === undefined || headerPair === undefined)
				throw new Error(
					`${fixture.name} is missing its English or header pair`,
				);
			expect(
				backdrops(englishPair, fixture.doc).map((backdrop) => backdrop.ref),
				fixture.name,
			).toEqual(fixture.englishBackdrops);
			expect(
				backdrops(headerPair, fixture.doc).map((backdrop) => backdrop.ref),
				fixture.name,
			).toEqual([ITEM_HOVER_BASE]);

			const results = evaluate(fixture.doc, DECLARED_BACKDROP_FIXTURE_TOKENS);
			expect(
				declaredTextTraceProblems(englishPair, fixture.doc, results, true),
				fixture.name,
			).toEqual([]);
			expect(
				declaredTextTraceProblems(headerPair, fixture.doc, results, true),
				fixture.name,
			).toEqual([]);
			expect(
				results.filter((result) => result.pair === headerPair.id),
			).toHaveLength(2);
		}
	});

	test("declared-backdrop tracer rejects missing, extra, duplicate, and failing results", () => {
		const fixture = declaredBackdropTracerFixture([
			ITEM_HOVER_BASE,
			ITEM_HOVER_OVERLAY_ID,
		]);
		const englishPair = fixture.pairs.find(
			(pair) => pair.id === "text-secondary",
		);
		if (englishPair === undefined)
			throw new Error("English fixture pair is missing");
		const results = evaluate(fixture, DECLARED_BACKDROP_FIXTURE_TOKENS);
		const englishResults = results.filter(
			(result) => result.pair === englishPair.id,
		);
		const first = englishResults[0];
		const second = englishResults[1];
		if (first === undefined || second === undefined)
			throw new Error("English fixture results are missing");

		const missingBackdrop = results.filter(
			(result) =>
				result.pair !== englishPair.id ||
				!(result.bgRef === ITEM_HOVER_OVERLAY_ID && result.theme === "dark"),
		);
		expect(
			declaredTextTraceProblems(englishPair, fixture, missingBackdrop),
		).toContain(`missing declared result dark|${ITEM_HOVER_OVERLAY_ID}`);

		const missingTheme = results.filter(
			(result) => result.pair !== englishPair.id || result.theme !== "dark",
		);
		expect(
			declaredTextTraceProblems(englishPair, fixture, missingTheme).filter(
				(problem) => problem.startsWith("missing declared result dark|"),
			),
		).toHaveLength(2);

		const unexpected = {
			...first,
			backdrop: "bg",
			bgRef: "--ec-color-bg",
			rule: `text-secondary-on-bg-${first.theme}`,
			fingerprint: `contrast-gap|${first.story}|text-secondary-on-bg-${first.theme}`,
		};
		expect(
			declaredTextTraceProblems(englishPair, fixture, [...results, unexpected]),
		).toContain(
			`unexpected declared backdrop/theme ${first.theme}|--ec-color-bg`,
		);

		const duplicated = [...results, first];
		expect(
			declaredTextTraceProblems(englishPair, fixture, duplicated),
		).toContain(`duplicate declared result ${first.theme}|${first.bgRef}`);
		expect(
			declaredTextTraceProblems(englishPair, fixture, duplicated),
		).toContain(`duplicate result fingerprint ${first.fingerprint}`);

		const duplicateFingerprint = results.map((result) =>
			result.fingerprint === first.fingerprint
				? { ...result, fingerprint: second.fingerprint }
				: result,
		);
		expect(
			declaredTextTraceProblems(englishPair, fixture, duplicateFingerprint),
		).toContain(`duplicate result fingerprint ${second.fingerprint}`);

		const failingThreshold = results.map((result) =>
			result.fingerprint === first.fingerprint
				? {
						...result,
						ratio: result.threshold - 0.01,
						pass: false,
					}
				: result,
		);
		expect(
			declaredTextTraceProblems(englishPair, fixture, failingThreshold, true),
		).toContain(`text threshold failed for ${first.theme}|${first.bgRef}`);
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
		from?: string[];
		rule?: string;
	}>;
}>(".storybook/catalog/token_map.json");

const LEGACY_HOVER_TOKEN = "--ec-color-hover";
const SURFACE_HOVER_TOKEN = "--ec-color-surface-hover";
const LEGACY_HOVER_FINDING =
	"token-gap|settings-languagedropdown--item-hover|hover-token-undefined";
const LEGACY_HOVER_PAINT = "var(--ec-color-hover, rgba(0, 0, 0, 0.04))";
const SURFACE_HOVER_PAINT = "var(--ec-color-surface-hover)";
const LEGACY_HOVER_FALLBACK = "rgba(0, 0, 0, 0.04)";
const PALETTE_HOVER_SOURCES = ["color.dark.tide", "color.light.rinse"];

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

type HoverContractState = "legacy" | "palette";

type HoverContractFixture = {
	state: HoverContractState;
	languageCss: string;
	sheets: Record<string, string>;
	doc: ContrastPairsDocument;
	tokenMap: typeof TOKEN_MAP;
	tokensCss: string;
};

function sourceMapHoverState({
	languageComponent,
	languageCss,
	sheets,
	doc,
	tokenMap,
	tokensCss,
}: {
	languageComponent: string;
	languageCss: string;
	sheets: Record<string, string>;
	doc: ContrastPairsDocument;
	tokenMap: typeof TOKEN_MAP;
	tokensCss: string;
}): HoverContractState | null {
	const paint = itemHoverPaintFromCss(languageCss);
	if (paint === null) return null;
	if (
		languageHoverContractProblems({
			languageComponent,
			languageCss,
			doc,
			tokensCss,
		}).length > 0
	) {
		return null;
	}

	const legacyEntries = tokenMap.entries.filter(
		(entry) => entry.name === LEGACY_HOVER_TOKEN,
	);
	const paletteEntries = tokenMap.entries.filter(
		(entry) => entry.name === SURFACE_HOVER_TOKEN,
	);
	const tokens = themeTokens(tokensCss);
	const productionCss = [
		...Object.entries(sheets)
			.filter(([file]) => file !== "tokens.css")
			.map(([, source]) => source),
		tokensCss,
	].join("\n");

	if (paint === LEGACY_HOVER_PAINT) {
		const legacy = legacyEntries[0];
		const legacyReferenceCount =
			productionCss.split(LEGACY_HOVER_TOKEN).length - 1;
		if (
			legacyEntries.length !== 1 ||
			legacy?.disposition !== "retire" ||
			legacy.finding !== LEGACY_HOVER_FINDING ||
			legacy.reason?.trim() === undefined ||
			legacy.reason.trim().length === 0 ||
			paletteEntries.length !== 0 ||
			legacyReferenceCount !== 1 ||
			THEMES.some(
				(theme) =>
					tokens[theme].has(LEGACY_HOVER_TOKEN) ||
					tokens[theme].has(SURFACE_HOVER_TOKEN),
			)
		) {
			return null;
		}
		return "legacy";
	}

	if (paint === SURFACE_HOVER_PAINT) {
		const surface = paletteEntries[0];
		const legacyReferenceCount =
			productionCss.split(LEGACY_HOVER_TOKEN).length - 1;
		const declaredValues = Object.fromEntries(
			THEMES.map((theme) => {
				const resolved = resolveColour(SURFACE_HOVER_TOKEN, theme, tokens, doc);
				return [theme, resolved === null ? null : toHex(resolved)];
			}),
		) as Record<(typeof THEMES)[number], string | null>;
		if (
			legacyEntries.length !== 0 ||
			legacyReferenceCount !== 0 ||
			paletteEntries.length !== 1 ||
			surface?.disposition !== "derive" ||
			JSON.stringify([...(surface.from ?? [])].sort()) !==
				JSON.stringify(PALETTE_HOVER_SOURCES) ||
			THEMES.some(
				(theme) =>
					!tokens[theme].has(SURFACE_HOVER_TOKEN) ||
					declaredValues[theme] !==
						toHex(colour(PALETTE_HOVER_TEST_COLORS[theme])),
			)
		) {
			return null;
		}
		return "palette";
	}

	return null;
}

function withoutPaletteHoverTokenDeclarations(tokensCss: string): string {
	return tokensCss
		.replace(/^[\t ]*--ec-color-surface-hover\s*:[^\r\n;]+;[\t ]*\r?\n?/gm, "")
		.replace(/:root\s*\{\s*--ec-color-surface-hover\s*:[^;}]+;\s*\}/g, "")
		.replace(
			/\[data-theme="dark"\]\s*\{\s*--ec-color-surface-hover\s*:[^;}]+;\s*\}/g,
			"",
		);
}

function hoverContractFixture(
	state: HoverContractState,
	ambientDoc: ContrastPairsDocument = PAIRS,
): HoverContractFixture {
	const schemaState = fixtureSchemaState(ambientDoc);
	if (schemaState === null) {
		throw new Error("ambient pairs document has mixed or incomplete metadata");
	}
	const sourceFile = SHEETS["language_dropdown.css"] ?? "";
	const englishRule = sourceFile.match(
		/\.language-dropdown__english\s*\{[^}]*\}/s,
	)?.[0];
	if (englishRule === undefined)
		throw new Error("source English child rule is missing for hover fixture");
	const languageCss = `${englishRule}\n.language-dropdown__item:hover,\n.language-dropdown__item--focused { background: ${state === "legacy" ? LEGACY_HOVER_PAINT : SURFACE_HOVER_PAINT}; }`;
	const layer =
		state === "legacy" ? LEGACY_HOVER_FALLBACK : SURFACE_HOVER_TOKEN;
	const doc = languageHoverPairFixture(layer, ambientDoc, schemaState);
	const tokensCss =
		state === "legacy"
			? withoutPaletteHoverTokenDeclarations(TOKENS_CSS)
			: paletteHoverTokensCss(TOKENS_CSS);
	const platformEntries = TOKEN_MAP.entries
		.filter((entry) => hasOwnKey(NO_INFORMATION_FIXTURE_SOURCES, entry.name))
		.map((entry) => clone(entry));
	const hoverEntry =
		state === "legacy"
			? {
					name: LEGACY_HOVER_TOKEN,
					disposition: "retire",
					finding: LEGACY_HOVER_FINDING,
					reason:
						"The registered legacy hover name uses its declared overlay fallback.",
				}
			: {
					name: SURFACE_HOVER_TOKEN,
					disposition: "derive",
					from: [...PALETTE_HOVER_SOURCES],
					rule: "The semantic item-hover surface is declared in both themes.",
				};
	const tokenMap = { entries: [...platformEntries, hoverEntry] };
	return {
		state,
		languageCss,
		sheets: { "language_dropdown.css": languageCss },
		doc,
		tokenMap,
		tokensCss,
	};
}

function paletteLikeAmbientHoverPairs(): ContrastPairsDocument {
	const fixture = clone(PAIRS);
	fixture.surfaces = [...new Set([...fixture.surfaces, ITEM_HOVER_BASE])];
	fixture.overlays = [
		...fixture.overlays.filter((entry) => entry.id !== ITEM_HOVER_OVERLAY_ID),
		{
			id: ITEM_HOVER_OVERLAY_ID,
			layers: [ITEM_HOVER_BASE, SURFACE_HOVER_TOKEN],
		},
	];
	fixture.localTokens[SURFACE_HOVER_TOKEN] = {
		...PALETTE_HOVER_TEST_COLORS,
	};
	fixture.pairs = fixture.pairs.filter(
		(pair) => pair.id !== "primary-text-on-surface-hover",
	);
	fixture.pairs.push({
		id: "primary-text-on-surface-hover",
		fg: "--ec-color-text-primary",
		on: [SURFACE_HOVER_TOKEN],
		role: "text",
		selector: ".primary-text-on-surface-hover",
		story: "fixture-palette-hover",
	});
	return fixture;
}

function fixtureState(
	fixture: HoverContractFixture,
): HoverContractState | null {
	return sourceMapHoverState({
		languageComponent: readText(
			"src/renderer/components/settings/LanguageDropdown.tsx",
		),
		languageCss: fixture.languageCss,
		sheets: fixture.sheets,
		doc: fixture.doc,
		tokenMap: fixture.tokenMap,
		tokensCss: fixture.tokensCss,
	});
}

function fixtureG2Problems(fixture: HoverContractFixture) {
	return g2Report(
		fixture.sheets,
		fixture.doc,
		fixture.tokensCss,
		fixture.tokenMap,
	).problems;
}

function withRule(file: string, rule: string): Record<string, string> {
	return { ...SHEETS, [file]: `${SHEETS[file] ?? ""}\n${rule}\n` };
}

const LEGACY_SELECTION_PAIR: ContrastPair = {
	id: "selection",
	fg: "white",
	on: ["--ec-color-accent"],
	role: "text",
	selector: "::selection",
	story: "file-list-filetable--mixed-statuses",
};
const LEGACY_SELECTION_RULE = `::selection {
	background-color: var(--ec-color-accent);
	color: white;
}`;
const LEGACY_SELECTION_SOURCE_USE: FixtureSourceUse = {
	file: "tokens.css",
	selector: "::selection",
	property: "color",
};

type SelectionFixture = {
	sheets: Record<string, string>;
	doc: ContrastPairsDocument;
	tokensCss: string;
};

function selectionDeclarations(tokensCss: string) {
	return cssDeclarations(tokensCss)
		.filter(
			(declaration) =>
				declaration.selectors.length === 1 &&
				declaration.selectors[0] === "::selection",
		)
		.map(({ selectors, property, value }) => ({ selectors, property, value }));
}

function selectionSourcePairState(
	tokensCss: string,
	doc: ContrastPairsDocument,
): "legacy" | "absent" {
	const pair = doc.pairs.find((candidate) => candidate.id === "selection");
	const declarations = selectionDeclarations(tokensCss);
	const sourceDoc = doc as HoverFixtureDocument;
	const selectionLiterals = (sourceDoc.literals ?? []).filter(
		(literal) => literal.pair === "selection",
	);
	if (pair === undefined && declarations.length === 0) {
		if (selectionLiterals.length !== 0) {
			throw new Error("absent selection source retains a selection literal");
		}
		return "absent";
	}
	if (
		pair === undefined ||
		declarations.length !== 2 ||
		selectionLiterals.length !== 1
	) {
		throw new Error("selection source and pair are incomplete or inconsistent");
	}
	if (
		JSON.stringify({
			id: pair.id,
			fg: pair.fg,
			on: pair.on,
			role: pair.role,
			selector: pair.selector,
			story: pair.story,
		}) !== JSON.stringify(LEGACY_SELECTION_PAIR)
	) {
		throw new Error(
			"legacy selection pair no longer matches its source identity",
		);
	}
	if (
		JSON.stringify(declarations) !==
		JSON.stringify([
			{
				selectors: ["::selection"],
				property: "background-color",
				value: "var(--ec-color-accent)",
			},
			{
				selectors: ["::selection"],
				property: "color",
				value: "white",
			},
		])
	) {
		throw new Error(
			"legacy selection declarations no longer match the source fixture",
		);
	}
	const schemaState = fixtureSchemaState(doc);
	const literal = selectionLiterals[0];
	if (schemaState === null || literal === undefined) {
		throw new Error("selection pair metadata has a mixed or incomplete schema");
	}
	if (
		literal.value !== "white" ||
		JSON.stringify(literal.files) !== JSON.stringify(["tokens.css"]) ||
		(schemaState === "source-owned" &&
			JSON.stringify(literal.uses) !==
				JSON.stringify([LEGACY_SELECTION_SOURCE_USE])) ||
		(schemaState === "legacy" && hasOwnKey(literal, "uses"))
	) {
		throw new Error("selection literal does not match its CSS source/schema");
	}
	return "legacy";
}

function selectionFixtureLiteral(state: FixtureSchemaState): FixtureLiteral {
	return state === "source-owned"
		? {
				value: "white",
				files: ["tokens.css"],
				uses: [{ ...LEGACY_SELECTION_SOURCE_USE }],
				pair: "selection",
			}
		: { value: "white", files: ["tokens.css"], pair: "selection" };
}

function legacySelectionFixture(
	ambientSheets: Record<string, string> = SHEETS,
	ambientDoc: ContrastPairsDocument = PAIRS,
): SelectionFixture {
	const sheets = { ...ambientSheets };
	const doc = clone(ambientDoc) as HoverFixtureDocument;
	const state = selectionSourcePairState(sheets["tokens.css"] ?? "", doc);
	if (state === "absent") {
		const schemaState = fixtureSchemaState(doc);
		if (schemaState === null) {
			throw new Error(
				"selection fixture has a mixed or incomplete literal schema",
			);
		}
		if (doc.literals?.some((literal) => literal.value === "white")) {
			throw new Error("selection fixture would duplicate the white literal");
		}
		doc.pairs.push({
			...LEGACY_SELECTION_PAIR,
			on: [...LEGACY_SELECTION_PAIR.on],
		});
		doc.literals = [
			...(doc.literals ?? []),
			selectionFixtureLiteral(schemaState),
		];
		sheets["tokens.css"] =
			`${sheets["tokens.css"] ?? ""}\n${LEGACY_SELECTION_RULE}\n`;
	}
	const tokensCss = sheets["tokens.css"] ?? "";
	if (selectionSourcePairState(tokensCss, doc) !== "legacy") {
		throw new Error(
			"legacy selection fixture did not retain its source and pair",
		);
	}
	return { sheets, doc: doc as ContrastPairsDocument, tokensCss };
}

function removeSelectionRule(tokensCss: string): string {
	const selectorAt = tokensCss.indexOf("::selection");
	if (selectorAt === -1) return tokensCss;
	const openAt = tokensCss.indexOf("{", selectorAt);
	if (openAt === -1) throw new Error("selection rule has no opening brace");
	let depth = 0;
	let closeAt = -1;
	for (let index = openAt; index < tokensCss.length; index += 1) {
		if (tokensCss[index] === "{") depth += 1;
		if (tokensCss[index] === "}") {
			depth -= 1;
			if (depth === 0) {
				closeAt = index;
				break;
			}
		}
	}
	if (closeAt === -1) throw new Error("selection rule has no closing brace");
	return `${tokensCss.slice(0, selectorAt)}${tokensCss.slice(closeAt + 1)}`;
}

function absentSelectionFixture(
	ambientSheets: Record<string, string> = SHEETS,
	ambientDoc: ContrastPairsDocument = PAIRS,
): SelectionFixture {
	const sheets = { ...ambientSheets };
	const doc = clone(ambientDoc) as HoverFixtureDocument;
	const currentState = selectionSourcePairState(
		sheets["tokens.css"] ?? "",
		doc,
	);
	if (currentState === "legacy") {
		sheets["tokens.css"] = removeSelectionRule(sheets["tokens.css"] ?? "");
		doc.pairs = doc.pairs.filter((pair) => pair.id !== "selection");
		doc.literals = (doc.literals ?? []).filter(
			(literal) => literal.pair !== "selection",
		);
	}
	const tokensCss = sheets["tokens.css"] ?? "";
	if (selectionSourcePairState(tokensCss, doc) !== "absent") {
		throw new Error("absent selection fixture retained source or pair data");
	}
	return { sheets, doc: doc as ContrastPairsDocument, tokensCss };
}

function withoutPairIds(
	doc: ContrastPairsDocument,
	...ids: string[]
): ContrastPairsDocument {
	const result = clone(doc);
	result.pairs = result.pairs.filter((pair) => !ids.includes(pair.id));
	return result;
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
		const semanticRole = "--ec-color-surface-hover";
		const paletteSemanticCss = paletteHoverTokensCss(TOKENS_CSS);
		const paletteSemanticTokens = themeTokens(paletteSemanticCss);
		const unresolvedSemantic = languageHoverPairFixture(semanticRole);
		expect(unresolvedSemantic.localTokens[semanticRole]).toEqual(
			PALETTE_HOVER_TEST_COLORS,
		);
		delete unresolvedSemantic.localTokens[semanticRole];
		const unresolvedSemanticCss = paletteSemanticCss.replace(
			/--ec-color-surface-hover\s*:\s*[^;}]+;?/g,
			"",
		);
		const unresolvedSemanticTokens = themeTokens(unresolvedSemanticCss);
		expect(unresolvedSemantic.localTokens[semanticRole]).toBeUndefined();
		expect(unresolvedSemanticCss).not.toMatch(/--ec-color-surface-hover\s*:/);
		for (const theme of THEMES) {
			expect(paletteSemanticTokens[theme].has(semanticRole)).toBe(true);
			expect(unresolvedSemanticTokens[theme].has(semanticRole)).toBe(false);
			expect(
				resolveColour(
					semanticRole,
					theme,
					unresolvedSemanticTokens,
					unresolvedSemantic,
				),
			).toBeNull();
		}
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: paletteSource,
				doc: unresolvedSemantic,
				tokensCss: unresolvedSemanticCss,
			}),
		).toContain("English item hover background is unsupported or unresolved");
		const restoredSemantic = languageHoverPairFixture(semanticRole);
		expect(
			languageHoverContractProblems({
				languageComponent,
				languageCss: paletteSource,
				doc: restoredSemantic,
				tokensCss: paletteSemanticCss,
			}),
		).toEqual([]);
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

	test("the real hover source and token map select one coherent scoped G2-clean state", () => {
		const languageCss = SHEETS["language_dropdown.css"] ?? "";
		const actualLayer = itemHoverLayerFromCss(languageCss, TOKENS_CSS, PAIRS);
		expect(actualLayer).not.toBeNull();
		const sourceBackedPairs = languageHoverPairFixture(actualLayer as string);
		const state = sourceMapHoverState({
			languageComponent: readText(
				"src/renderer/components/settings/LanguageDropdown.tsx",
			),
			languageCss,
			sheets: SHEETS,
			doc: sourceBackedPairs,
			tokenMap: TOKEN_MAP,
			tokensCss: TOKENS_CSS,
		});
		expect(state).not.toBeNull();
		if (state === null)
			throw new Error("actual hover source/map state is invalid");
		const actualItemHover = PAIRS.overlays.find(
			(overlay) => overlay.id === ITEM_HOVER_OVERLAY_ID,
		);
		if (actualItemHover === undefined)
			throw new Error("actual item-hover overlay is missing from PAIRS");
		const actualEnglishPair = PAIRS.pairs.find(
			(pair) => pair.selector === ".language-dropdown__english",
		);
		const actualHeaderPair = PAIRS.pairs.find(
			(pair) => pair.selector === ".file-table__header",
		);
		if (state === "legacy") {
			// Master carries the registered fallback in the item-hover overlay; its
			// sole text-secondary pair is still the header row on global surfaces.
			expect(actualLayer).toBe(LEGACY_HOVER_FALLBACK);
			expect(PAIRS.surfaces).toContain(ITEM_HOVER_OVERLAY_ID);
			expect(actualItemHover.layers).toEqual([
				ITEM_HOVER_BASE,
				LEGACY_HOVER_FALLBACK,
			]);
			expect(actualEnglishPair).toBeUndefined();
			expect(actualHeaderPair).toMatchObject({
				id: "text-secondary",
				fg: ITEM_HOVER_ENGLISH_ROLE,
				on: "surfaces",
				role: "text",
				story: "file-list-filetable--mixed-statuses",
			});
			expect(PAIRS.literals).toContainEqual(
				expect.objectContaining({
					value: LEGACY_HOVER_FALLBACK,
					files: expect.arrayContaining(["language_dropdown.css"]),
					pair: "text-secondary",
				}),
			);
		} else {
			if (actualEnglishPair === undefined || actualHeaderPair === undefined) {
				throw new Error("actual English/header pairs are missing from PAIRS");
			}
			expect(actualLayer).toBe(SURFACE_HOVER_TOKEN);
			expect(actualEnglishPair).toMatchObject({
				id: "text-secondary",
				fg: ITEM_HOVER_ENGLISH_ROLE,
				on: [ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID],
				role: "text",
				story: "settings-languagedropdown--item-hover",
			});
			expect(backdrops(actualEnglishPair, PAIRS).map(({ ref }) => ref)).toEqual(
				[ITEM_HOVER_BASE, ITEM_HOVER_OVERLAY_ID],
			);
			expect(actualHeaderPair).toMatchObject({
				id: "text-secondary-file-table-header",
				fg: ITEM_HOVER_ENGLISH_ROLE,
				on: [ITEM_HOVER_BASE],
				role: "text",
				story: "file-list-filetable--mixed-statuses",
			});
			expect(actualItemHover.layers).toEqual([
				ITEM_HOVER_BASE,
				SURFACE_HOVER_TOKEN,
			]);
		}
		const scopedReport = g2Report(
			{ "language_dropdown.css": languageCss },
			PAIRS,
			TOKENS_CSS,
			TOKEN_MAP,
		);
		expect(scopedReport.problems).toEqual([]);
		expect(scopedReport.classified).toBeGreaterThan(0);

		const actualPaint = itemHoverPaintFromCss(languageCss);
		expect(actualPaint).not.toBeNull();
		const invalidHoverToken = "--ec-color-g2-hover-scope-invalid";
		const invalidLanguageCss = languageCss.replace(
			actualPaint as string,
			`var(${invalidHoverToken})`,
		);
		expect(invalidLanguageCss).not.toBe(languageCss);
		const invalidScopedReport = g2Report(
			{ "language_dropdown.css": invalidLanguageCss },
			PAIRS,
			TOKENS_CSS,
			TOKEN_MAP,
		);
		expect(invalidScopedReport.problems).toHaveLength(
			scopedReport.problems.length + 1,
		);
		const invalidHoverProblem = invalidScopedReport.problems.find((problem) =>
			problem.message.includes(invalidHoverToken),
		);
		expect(invalidHoverProblem).toMatchObject({
			code: "g2-unclassified-token",
			file: "language_dropdown.css",
		});
		expect(
			sourceMapHoverState({
				languageComponent: readText(
					"src/renderer/components/settings/LanguageDropdown.tsx",
				),
				languageCss: invalidLanguageCss,
				sheets: { ...SHEETS, "language_dropdown.css": invalidLanguageCss },
				doc: sourceBackedPairs,
				tokenMap: TOKEN_MAP,
				tokensCss: TOKENS_CSS,
			}),
		).toBeNull();

		const unrelatedToken = "--ec-color-g2-sensitivity-unrelated";
		const wholeTreeBefore = g2().problems;
		const wholeTreeWithUnrelatedError = g2(
			withRule(
				"settings_drawer.css",
				`.g2-sensitivity { background: var(${unrelatedToken}); }`,
			),
		).problems;
		expect(wholeTreeWithUnrelatedError).toHaveLength(
			wholeTreeBefore.length + 1,
		);
		const unrelatedProblem = wholeTreeWithUnrelatedError.find((problem) =>
			problem.message.includes(unrelatedToken),
		);
		expect(unrelatedProblem).toMatchObject({
			code: "g2-unclassified-token",
			file: "settings_drawer.css",
		});
	});

	test.each(["legacy", "palette"] as const)(
		"a coherent %s source and map fixture remains fully classified",
		(state) => {
			const fixture = hoverContractFixture(state);
			expect(fixtureState(fixture)).toBe(state);
			expect(pairsShapeProblems(fixture.doc)).toEqual([]);
			const metadataState = fixtureSchemaState(fixture.doc);
			expect(metadataState).not.toBeNull();
			if (metadataState === null)
				throw new Error("hover fixture metadata state is incomplete");
			expect(hoverFixtureMetadataProblems(fixture.doc, metadataState)).toEqual(
				[],
			);
			expect(
				fixture.tokenMap.entries.filter((entry) =>
					hasOwnKey(NO_INFORMATION_FIXTURE_SOURCES, entry.name),
				),
			).toHaveLength(Object.keys(NO_INFORMATION_FIXTURE_SOURCES).length);
			for (const entry of fixture.tokenMap.entries.filter((candidate) =>
				hasOwnKey(NO_INFORMATION_FIXTURE_SOURCES, candidate.name),
			)) {
				expect(entry.disposition).toBe("keep-platform");
				expect(entry.reason).toMatch(/no brand equivalent/i);
				expect(entry.reason).toMatch(/with a written reason/i);
			}
			expect(fixtureG2Problems(fixture)).toEqual([]);
		},
	);

	test("hover fixture metadata keeps both exact schemas and rejects malformed ownership", () => {
		const legacy = languageHoverPairFixture(
			LEGACY_HOVER_FALLBACK,
			PAIRS,
			"legacy",
		);
		const sourceOwned = languageHoverPairFixture(
			LEGACY_HOVER_FALLBACK,
			PAIRS,
			"source-owned",
		);
		expect(fixtureSchemaProblems(legacy, "legacy")).toEqual([]);
		expect(fixtureSchemaProblems(sourceOwned, "source-owned")).toEqual([]);
		expect(fixtureSchemaState(legacy)).toBe("legacy");
		expect(fixtureSchemaState(sourceOwned)).toBe("source-owned");
		for (const name of Object.keys(NO_INFORMATION_FIXTURE_SOURCES)) {
			const ambient = (PAIRS as HoverFixtureDocument).exempt?.find(
				(entry) => entry.name === name,
			);
			for (const fixture of [legacy, sourceOwned]) {
				const entry = (fixture as HoverFixtureDocument).exempt?.find(
					(candidate) => candidate.name === name,
				);
				expect(entry?.reason).toBe(ambient?.reason);
			}
		}

		const sourceDoc = sourceOwned as HoverFixtureDocument;
		const sourceLiteral = sourceDoc.literals?.[0];
		if (sourceLiteral === undefined)
			throw new Error("source-owned hover literal is missing");
		const malformed: Array<{
			name: string;
			mutate: (doc: HoverFixtureDocument) => void;
		}> = [
			{
				name: "missing uses",
				mutate: (doc) => {
					delete doc.literals?.[0]?.uses;
				},
			},
			{
				name: "wrong file",
				mutate: (doc) => {
					const literal = doc.literals?.[0];
					if (literal === undefined || literal.uses?.[0] === undefined) return;
					literal.files = ["settings_drawer.css"];
					literal.uses[0].file = "settings_drawer.css";
				},
			},
			{
				name: "wrong selector",
				mutate: (doc) => {
					const use = doc.literals?.[0]?.uses?.[0];
					if (use !== undefined) use.selector = ".language-dropdown__english";
				},
			},
			{
				name: "wrong property",
				mutate: (doc) => {
					const use = doc.literals?.[0]?.uses?.[0];
					if (use !== undefined) use.property = "color";
				},
			},
			{
				name: "duplicate source use",
				mutate: (doc) => {
					const literal = doc.literals?.[0];
					if (literal?.uses?.[0] !== undefined)
						literal.uses.push({ ...literal.uses[0] });
				},
			},
			{
				name: "incomplete no-information record",
				mutate: (doc) => {
					const entry = doc.exempt?.find(
						(candidate) => candidate.name === "--ec-shadow-drawer",
					);
					if (entry !== undefined) delete entry.sourceUses;
				},
			},
		];
		for (const item of malformed) {
			const candidate = clone(sourceOwned) as HoverFixtureDocument;
			item.mutate(candidate);
			expect(
				hoverFixtureMetadataProblems(
					candidate as ContrastPairsDocument,
					"source-owned",
				),
				item.name,
			).not.toEqual([]);
		}
		expect(hoverFixtureMetadataProblems(sourceOwned, "source-owned")).toEqual(
			[],
		);
	});

	test("palette fixtures reject retired-token restoration and incoherent states", () => {
		const palette = hoverContractFixture("palette");
		expect(fixtureState(palette)).toBe("palette");
		expect(fixtureG2Problems(palette)).toEqual([]);
		expect(
			palette.tokenMap.entries.some(
				(entry) => entry.name === LEGACY_HOVER_TOKEN,
			),
		).toBe(false);
		expect(
			[...Object.values(palette.sheets), palette.tokensCss].some((source) =>
				source.includes(LEGACY_HOVER_TOKEN),
			),
		).toBe(false);

		const restoredRetiredReference = {
			...palette,
			languageCss: palette.languageCss.replace(
				SURFACE_HOVER_PAINT,
				LEGACY_HOVER_PAINT,
			),
			sheets: {
				...palette.sheets,
				"language_dropdown.css": palette.languageCss.replace(
					SURFACE_HOVER_PAINT,
					LEGACY_HOVER_PAINT,
				),
			},
		};
		expect(fixtureState(restoredRetiredReference)).toBeNull();

		const wrongSelector = {
			...palette,
			languageCss: palette.languageCss.replace(
				".language-dropdown__item:hover,",
				".language-dropdown__trigger:hover,",
			),
		};
		wrongSelector.sheets["language_dropdown.css"] = wrongSelector.languageCss;
		expect(fixtureState(wrongSelector)).toBeNull();

		const wrongDisposition = clone(palette);
		const surface = wrongDisposition.tokenMap.entries.find(
			(entry) => entry.name === SURFACE_HOVER_TOKEN,
		);
		if (surface === undefined)
			throw new Error("surface-hover map entry is missing");
		surface.disposition = "retire";
		expect(fixtureState(wrongDisposition)).toBeNull();

		const missingMapRole = clone(palette);
		missingMapRole.tokenMap.entries = missingMapRole.tokenMap.entries.filter(
			(entry) => entry.name !== SURFACE_HOVER_TOKEN,
		);
		expect(fixtureState(missingMapRole)).toBeNull();

		const missingRole = {
			...palette,
			tokensCss: withoutPaletteHoverTokenDeclarations(palette.tokensCss),
		};
		expect(fixtureState(missingRole)).toBeNull();

		const unsupportedValue = {
			...palette,
			languageCss: palette.languageCss.replace(
				SURFACE_HOVER_PAINT,
				"var(--ec-color-surface-hover-alt)",
			),
		};
		unsupportedValue.sheets["language_dropdown.css"] =
			unsupportedValue.languageCss;
		expect(fixtureState(unsupportedValue)).toBeNull();

		const legacyMapOnPaletteSource = {
			...palette,
			tokenMap: hoverContractFixture("legacy").tokenMap,
		};
		expect(fixtureState(legacyMapOnPaletteSource)).toBeNull();
	});

	test("an invalid active legacy fallback remains a red G2 control", () => {
		const fixture = hoverContractFixture("legacy");
		expect(fixtureState(fixture)).toBe("legacy");
		expect(fixtureG2Problems(fixture)).toEqual([]);
		const schemaState = fixtureSchemaState(fixture.doc);
		if (schemaState === null)
			throw new Error("legacy hover fixture metadata is incomplete");
		const invalidLanguageCss = fixture.languageCss.replace(
			LEGACY_HOVER_PAINT,
			"var(--ec-color-hover, #ffffff)",
		);
		const invalidDoc = clone(fixture.doc) as HoverFixtureDocument;
		invalidDoc.literals = [
			...(invalidDoc.literals ?? []),
			hoverFixtureLiteral("#ffffff", schemaState),
		];
		expect(
			hoverFixtureMetadataProblems(
				invalidDoc as ContrastPairsDocument,
				schemaState,
			),
		).toEqual([]);
		const invalidFixture = {
			...fixture,
			languageCss: invalidLanguageCss,
			sheets: { "language_dropdown.css": invalidLanguageCss },
			doc: invalidDoc as ContrastPairsDocument,
		};
		expect(codes(fixtureG2Problems(invalidFixture))).toEqual([
			"g2-unknown-surface",
		]);
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

	test("route: dropping the active legacy hover finding reds exactly that name", () => {
		const paletteAmbient = paletteLikeAmbientHoverPairs();
		expect(
			paletteAmbient.pairs.some(
				(pair) =>
					pair.id === "primary-text-on-surface-hover" &&
					pair.on.includes(SURFACE_HOVER_TOKEN),
			),
		).toBe(true);
		expect(
			paletteAmbient.overlays.some((overlay) =>
				overlay.layers.includes(SURFACE_HOVER_TOKEN),
			),
		).toBe(true);

		const inheritedLegacyDoc = clone(paletteAmbient);
		delete inheritedLegacyDoc.localTokens[SURFACE_HOVER_TOKEN];
		expect(
			inheritedLegacyDoc.overlays.find(
				(overlay) => overlay.id === ITEM_HOVER_OVERLAY_ID,
			)?.layers,
		).toEqual([ITEM_HOVER_BASE, SURFACE_HOVER_TOKEN]);
		const replacementLegacyPairs = languageHoverPairFixture(
			LEGACY_HOVER_FALLBACK,
		).pairs;
		inheritedLegacyDoc.pairs = [
			...inheritedLegacyDoc.pairs.filter(
				(pair) =>
					pair.id !== "text-secondary" &&
					pair.id !== "text-secondary-file-table-header" &&
					pair.id !== "primary-text-on-surface-hover",
			),
			...replacementLegacyPairs,
		];
		const paletteTokensWithoutHover = withoutPaletteHoverTokenDeclarations(
			paletteHoverTokensCss(TOKENS_CSS),
		);
		expect(() =>
			evaluate(inheritedLegacyDoc, paletteTokensWithoutHover),
		).toThrow(
			/backdrop item-hover: layer --ec-color-surface-hover is not a colour in the light theme/,
		);

		const fixture = hoverContractFixture("legacy", paletteAmbient);
		expect(fixture.doc.overlays).toEqual([
			{
				id: ITEM_HOVER_OVERLAY_ID,
				layers: [ITEM_HOVER_BASE, LEGACY_HOVER_FALLBACK],
			},
		]);
		expect(fixture.doc.localTokens).toEqual({});
		expect(JSON.stringify(fixture.doc)).not.toContain(SURFACE_HOVER_TOKEN);
		const fixtureTokens = themeTokens(fixture.tokensCss);
		expect(
			THEMES.every((theme) => !fixtureTokens[theme].has(SURFACE_HOVER_TOKEN)),
		).toBe(true);
		for (const theme of THEMES) {
			for (const backdrop of [
				...fixture.doc.surfaces,
				...fixture.doc.overlays.flatMap((overlay) => overlay.layers),
			]) {
				expect(
					resolveColour(backdrop, theme, fixtureTokens, fixture.doc),
				).not.toBeNull();
			}
		}
		expect(pairsShapeProblems(fixture.doc)).toEqual([]);
		expect(evaluate(fixture.doc, fixture.tokensCss)).toHaveLength(6);
		expect(fixtureState(fixture)).toBe("legacy");
		expect(fixtureG2Problems(fixture)).toEqual([]);
		const map = clone(fixture.tokenMap);
		const entry = map.entries.find(
			(candidate) => candidate.name === LEGACY_HOVER_TOKEN,
		);
		if (entry === undefined) throw new Error("no active legacy hover entry");
		expect(
			map.entries
				.filter((candidate) =>
					hasOwnKey(NO_INFORMATION_FIXTURE_SOURCES, candidate.name),
				)
				.map((candidate) => candidate.name)
				.sort(),
		).toEqual(Object.keys(NO_INFORMATION_FIXTURE_SOURCES).sort());
		expect(
			map.entries.filter((candidate) => candidate.name === LEGACY_HOVER_TOKEN),
		).toHaveLength(1);
		expect(map.entries).toHaveLength(
			Object.keys(NO_INFORMATION_FIXTURE_SOURCES).length + 1,
		);
		expect(entry.disposition).toBe("retire");
		expect(entry.finding).toBe(LEGACY_HOVER_FINDING);
		delete entry.finding;
		const found = g2Report(
			fixture.sheets,
			fixture.doc,
			fixture.tokensCss,
			map,
		).problems;
		expect(codes(found)).toEqual(["g2-unclassified-token"]);
		expect(found).toHaveLength(1);
		expect(found[0]?.message).toContain(LEGACY_HOVER_TOKEN);
		entry.finding = LEGACY_HOVER_FINDING;
		expect(
			g2Report(fixture.sheets, fixture.doc, fixture.tokensCss, map).problems,
		).toEqual([]);
	});

	test("selection source and pair remain present together or absent together", () => {
		const state = selectionSourcePairState(TOKENS_CSS, PAIRS);
		const pair = PAIRS.pairs.find((candidate) => candidate.id === "selection");
		const declarations = selectionDeclarations(TOKENS_CSS);
		if (state === "legacy") {
			expect(pair).toMatchObject(LEGACY_SELECTION_PAIR);
			expect(declarations).toEqual([
				{
					selectors: ["::selection"],
					property: "background-color",
					value: "var(--ec-color-accent)",
				},
				{
					selectors: ["::selection"],
					property: "color",
					value: "white",
				},
			]);
		} else {
			expect(pair).toBeUndefined();
			expect(declarations).toEqual([]);
		}
	});

	test("legacy selection source and pair fixture stays classified and source-bound", () => {
		const fixture = legacySelectionFixture();
		expect(selectionSourcePairState(fixture.tokensCss, fixture.doc)).toBe(
			"legacy",
		);
		expect(pairsShapeProblems(fixture.doc)).toEqual([]);
		expect(
			g2Report(fixture.sheets, fixture.doc, fixture.tokensCss, TOKEN_MAP)
				.problems,
		).toEqual([]);
		const missingPair = withoutPairIds(
			fixture.doc,
			"selection",
			"toggle-thumb-on",
		);
		const found = g2Report(
			{ "tokens.css": fixture.tokensCss },
			missingPair,
			fixture.tokensCss,
			TOKEN_MAP,
		).problems;
		expect(found.map((problem) => problem.file)).toContain("tokens.css");
		expect(
			found
				.filter((problem) => problem.file === "tokens.css")
				.map(({ code }) => code),
		).toEqual(["g2-unknown-surface"]);
	});

	test("absent selection fixture makes selection-pair removal an exact no-op", () => {
		const fixture = absentSelectionFixture();
		expect(selectionSourcePairState(fixture.tokensCss, fixture.doc)).toBe(
			"absent",
		);
		expect(pairsShapeProblems(fixture.doc)).toEqual([]);
		const afterSelectionRemoval = withoutPairIds(fixture.doc, "selection");
		expect(afterSelectionRemoval).toEqual(fixture.doc);
		const before = g2Report(
			fixture.sheets,
			fixture.doc,
			fixture.tokensCss,
			TOKEN_MAP,
		);
		const after = g2Report(
			fixture.sheets,
			afterSelectionRemoval,
			fixture.tokensCss,
			TOKEN_MAP,
		);
		expect(after).toEqual(before);
		expect(
			after.problems.some((problem) => problem.file === "tokens.css"),
		).toBe(false);
	});

	test("route: dropping selection and on-track pairs flags only current source uses", () => {
		const state = selectionSourcePairState(TOKENS_CSS, PAIRS);
		const found = g2(
			SHEETS,
			withoutPairs("selection", "toggle-thumb-on"),
		).problems;
		const expectedFiles = [
			...(state === "legacy" ? ["tokens.css"] : []),
			"toggle_switch.css",
		].sort();
		expect(found.map((problem) => problem.file).sort()).toEqual(expectedFiles);
		expect(codes(found)).toEqual(
			expectedFiles.map(() => "g2-unknown-surface").sort(),
		);
		const onTrack = found.find(
			(problem) => problem.file === "toggle_switch.css",
		);
		expect(onTrack?.message).toContain("--ec-color-accent");
	});

	test("route: on-track thumb coverage is strict without selection as a backdrop", () => {
		const toggleCss = SHEETS["toggle_switch.css"] ?? "";
		const onTrackSource = cssDeclarations(toggleCss).filter(
			(declaration) =>
				declaration.selectors.length === 1 &&
				declaration.selectors[0] === ".toggle-switch__track--on" &&
				declaration.property === "background" &&
				declaration.value === "var(--ec-color-accent)",
		);
		expect(onTrackSource).toHaveLength(1);
		const sourceScope = { "toggle_switch.css": toggleCss };
		const noSelection = withoutPairs("selection");
		expect(
			g2Report(sourceScope, noSelection, TOKENS_CSS, TOKEN_MAP).problems,
		).toEqual([]);
		const missingOnTrack = withoutPairIds(noSelection, "toggle-thumb-on");
		const found = g2Report(
			sourceScope,
			missingOnTrack,
			TOKENS_CSS,
			TOKEN_MAP,
		).problems;
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			code: "g2-unknown-surface",
			file: "toggle_switch.css",
		});
		expect(found[0]?.message).toContain("--ec-color-accent");
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
