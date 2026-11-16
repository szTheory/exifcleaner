import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	THEMES,
	compareCodeUnits,
	resolveColour,
	themeTokens,
	type ContrastTheme,
} from "../contrast/contrast_model.mjs";
import { parseColour } from "../contrast/wcag.mjs";

// GAT-01 / D-09, D-12: every `adopt` row of the token map names a brand colour per theme, and
// tokens.css must resolve that custom property to exactly that colour. Today the four
// `adopt` tokens are listed as pending (the palette swap is Phase 77's PAL-01), so the gate
// is green with eight named pending rows; it is red on any other drift, red on a pending
// row that now matches (so the row must be removed with the token change), red on a null
// resolution (never "equal"), and red when it saw fewer than four `adopt` rows (a gate that
// stopped reading its input).
//
// The resolver is the one `contrast.test.ts` uses (`themeTokens`, `resolveColour`, read
// only), so a `--ec-color-bg: var(--ec-brand-bg)` hop in Phase 77 needs no change here: the
// hop fixture below proves it today. The pending list can only shrink: the merge-base check
// in scripts/shrink_only_check.mjs refuses a new row (D-10).

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

function readText(relPath: string): string {
	return fs.readFileSync(path.join(REPO, relPath), "utf8");
}

function readJson<T>(relPath: string): T {
	return JSON.parse(readText(relPath)) as T;
}

interface AdoptEntry {
	name: string;
	disposition: string;
	brand?: Partial<Record<ContrastTheme, { token: string; hex: string }>>;
}

interface TokenMapDocument {
	entries: AdoptEntry[];
}

interface PendingRow {
	token: string;
	theme: string;
	reason: string;
}

interface PendingDocument {
	rows: PendingRow[];
}

type DriftCode =
	| "unlisted-drift"
	| "fixed-still-pending"
	| "unresolved"
	| "vacuous"
	| "unknown-pending";

interface DriftProblem {
	code: DriftCode;
	subject: string;
}

// A small semantic floor keeps the gate useful without freezing the inventory.
const MIN_ADOPT_ROWS = 4;
const REQUIRED_ADOPT_TOKENS = [
	"--ec-color-bg",
	"--ec-color-surface",
	"--ec-color-text",
	"--ec-color-text-secondary",
];

function pendingKey({
	token,
	theme,
}: {
	token: string;
	theme: string;
}): string {
	return `${token}|${theme}`;
}

export function driftProblems({
	tokensCss,
	tokenMap,
	pending,
}: {
	tokensCss: string;
	tokenMap: TokenMapDocument;
	pending: PendingDocument;
}): DriftProblem[] {
	const problems: DriftProblem[] = [];
	const tokens = themeTokens(tokensCss);
	const adopt = tokenMap.entries.filter(
		(entry) => entry.disposition === "adopt",
	);
	const pendingKeys = new Set(pending.rows.map(pendingKey));
	const seen = new Set<string>();
	for (const entry of adopt) {
		for (const theme of THEMES) {
			const key = pendingKey({ token: entry.name, theme });
			seen.add(key);
			const hex = entry.brand?.[theme]?.hex;
			const want = hex === undefined ? null : parseColour(hex);
			const got = resolveColour(entry.name, theme, tokens, {});
			if (want === null || got === null) {
				problems.push({ code: "unresolved", subject: key });
				continue;
			}
			const equal =
				want.r === got.r &&
				want.g === got.g &&
				want.b === got.b &&
				want.a === got.a;
			if (!equal && !pendingKeys.has(key)) {
				problems.push({ code: "unlisted-drift", subject: key });
			}
			if (equal && pendingKeys.has(key)) {
				problems.push({ code: "fixed-still-pending", subject: key });
			}
		}
	}
	for (const key of pendingKeys) {
		if (!seen.has(key)) {
			problems.push({ code: "unknown-pending", subject: key });
		}
	}
	if (adopt.length < MIN_ADOPT_ROWS) {
		problems.push({
			code: "vacuous",
			subject: `adopt rows seen: ${adopt.length}`,
		});
	}
	return problems;
}

const TOKENS_CSS = readText("src/renderer/styles/tokens.css");
const TOKEN_MAP = readJson<TokenMapDocument>(
	".storybook/catalog/token_map.json",
);
const PENDING = readJson<PendingDocument>(
	"tests/renderer/gates/token_drift_pending.json",
);

// A tokens.css whose four adopt tokens equal the brand colours exactly, in both themes.
function matchingTokensCss(tokenMap: TokenMapDocument): string {
	const adopt = tokenMap.entries.filter(
		(entry) => entry.disposition === "adopt",
	);
	const declarations = (theme: ContrastTheme): string =>
		adopt
			.map((entry) => `${entry.name}:${entry.brand?.[theme]?.hex ?? ""};`)
			.join("");
	return `:root{${declarations("light")}}[data-theme="dark"]{${declarations("dark")}}`;
}

describe("GAT-01 token drift gate (D-09, D-12)", () => {
	test("the real tokens.css, token map and pending list give no problem", () => {
		expect(
			driftProblems({
				tokensCss: TOKENS_CSS,
				tokenMap: TOKEN_MAP,
				pending: PENDING,
			}),
		).toEqual([]);
	});

	test("every pending row names an adopted token in a supported theme", () => {
		const adoptNames = new Set(
			TOKEN_MAP.entries
				.filter((entry) => entry.disposition === "adopt")
				.map((entry) => entry.name),
		);
		expect(Array.isArray(PENDING.rows)).toBe(true);
		for (const row of PENDING.rows) {
			expect(adoptNames.has(row.token), row.token).toBe(true);
			expect(THEMES, row.theme).toContain(row.theme);
			expect(row.reason.length).toBeGreaterThanOrEqual(20);
		}
	});

	test("the pending rows are sorted by token then theme with no duplicate", () => {
		const keys = PENDING.rows.map(pendingKey);
		expect(new Set(keys).size).toBe(keys.length);
		const byTokenThenTheme = (first: PendingRow, second: PendingRow): number =>
			compareCodeUnits(first.token, second.token) ||
			compareCodeUnits(first.theme, second.theme);
		expect(PENDING.rows).toEqual([...PENDING.rows].sort(byTokenThenTheme));
	});

	test("anti-vacuity: semantic adopt roles have a hex in both themes", () => {
		const adopt = TOKEN_MAP.entries.filter(
			(entry) => entry.disposition === "adopt",
		);
		expect(adopt.length).toBeGreaterThanOrEqual(MIN_ADOPT_ROWS);
		for (const name of REQUIRED_ADOPT_TOKENS) {
			expect(
				adopt.some((entry) => entry.name === name),
				name,
			).toBe(true);
		}
		for (const entry of adopt) {
			for (const theme of THEMES) {
				expect(parseColour(entry.brand?.[theme]?.hex ?? "")).not.toBeNull();
			}
		}
	});

	test("a --ec-brand-* hop resolves through the shared resolver", () => {
		const css = ":root{--ec-brand-x:#ffffff;--ec-color-bg:var(--ec-brand-x)}";
		expect(
			resolveColour("--ec-color-bg", "light", themeTokens(css), {}),
		).toEqual({ r: 255, g: 255, b: 255, a: 1 });
	});

	test("a hop to the brand value is equal, so Phase 77 needs no change here", () => {
		const hopped = `:root{--ec-brand-bg:#FFFFFF;--ec-brand-ink:#0A2E2B;--ec-color-bg:var(--ec-brand-bg);--ec-color-surface:#EEF6F5;--ec-color-text:var(--ec-brand-ink);--ec-color-text-secondary:#4A625F}[data-theme="dark"]{--ec-brand-dark:#0A2E2B;--ec-color-bg:var(--ec-brand-dark);--ec-color-surface:#12403C;--ec-color-text:#FFFFFF;--ec-color-text-secondary:#A9C9C4}`;
		expect(
			driftProblems({
				tokensCss: hopped,
				tokenMap: TOKEN_MAP,
				pending: { rows: [] },
			}),
		).toEqual([]);
	});

	test("a fixture whose tokens equal the brand values passes with an empty pending list", () => {
		expect(
			driftProblems({
				tokensCss: matchingTokensCss(TOKEN_MAP),
				tokenMap: TOKEN_MAP,
				pending: { rows: [] },
			}),
		).toEqual([]);
	});

	test("negative control: one planted wrong hex is unlisted drift", () => {
		const planted = matchingTokensCss(TOKEN_MAP).replace(
			"--ec-color-surface:#EEF6F5;",
			"--ec-color-surface:#EEF6F6;",
		);
		expect(planted).not.toBe(matchingTokensCss(TOKEN_MAP));
		expect(
			driftProblems({
				tokensCss: planted,
				tokenMap: TOKEN_MAP,
				pending: { rows: [] },
			}),
		).toEqual([
			{ code: "unlisted-drift", subject: "--ec-color-surface|light" },
		]);
	});

	test("negative control: a missing fixture row makes its drift unlisted", () => {
		const matching = matchingTokensCss(TOKEN_MAP);
		const lightGround = TOKEN_MAP.entries.find(
			(entry) => entry.name === "--ec-color-bg",
		)?.brand?.light?.hex;
		if (lightGround === undefined) throw new Error("light ground is missing");
		const wrongGround =
			parseColour(lightGround)?.r === 0 ? "#ffffff" : "#000000";
		const planted = matching.replace(
			`--ec-color-bg:${lightGround};`,
			`--ec-color-bg:${wrongGround};`,
		);
		expect(planted).not.toBe(matching);
		const withRow = {
			rows: [
				{
					token: "--ec-color-bg",
					theme: "light",
					reason: "fixture row covers the deliberately wrong light ground",
				},
			],
		};
		expect(
			driftProblems({
				tokensCss: planted,
				tokenMap: TOKEN_MAP,
				pending: withRow,
			}),
		).toEqual([]);
		const withoutRow = { rows: [] };
		expect(
			driftProblems({
				tokensCss: planted,
				tokenMap: TOKEN_MAP,
				pending: withoutRow,
			}),
		).toEqual([{ code: "unlisted-drift", subject: "--ec-color-bg|light" }]);
	});

	test("a pending row that now matches is red, so it must be removed", () => {
		const problems = driftProblems({
			tokensCss: matchingTokensCss(TOKEN_MAP),
			tokenMap: TOKEN_MAP,
			pending: {
				rows: [
					{
						token: "--ec-color-bg",
						theme: "dark",
						reason: "planted pending row that already matches the brand colour",
					},
				],
			},
		});
		expect(problems).toEqual([
			{ code: "fixed-still-pending", subject: "--ec-color-bg|dark" },
		]);
	});

	test("a token that resolves to nothing is unresolved, never equal", () => {
		const missing = matchingTokensCss(TOKEN_MAP).replace(
			"--ec-color-text-secondary:#4A625F;",
			"",
		);
		expect(missing).not.toBe(matchingTokensCss(TOKEN_MAP));
		expect(
			driftProblems({
				tokensCss: missing,
				tokenMap: TOKEN_MAP,
				pending: { rows: [] },
			}),
		).toEqual([
			{ code: "unresolved", subject: "--ec-color-text-secondary|light" },
		]);
	});

	test("an unresolved row stays red even when it is listed as pending", () => {
		const missing = matchingTokensCss(TOKEN_MAP).replace(
			"--ec-color-text-secondary:#4A625F;",
			"",
		);
		const problems = driftProblems({
			tokensCss: missing,
			tokenMap: TOKEN_MAP,
			pending: {
				rows: [
					{
						token: "--ec-color-text-secondary",
						theme: "light",
						reason: "planted pending row for a token that resolves to nothing",
					},
				],
			},
		});
		expect(problems).toEqual([
			{ code: "unresolved", subject: "--ec-color-text-secondary|light" },
		]);
	});

	test("fewer than four adopt rows is vacuous", () => {
		const reduced: TokenMapDocument = {
			entries: TOKEN_MAP.entries.filter(
				(entry) =>
					entry.disposition !== "adopt" ||
					entry.name !== "--ec-color-text-secondary",
			),
		};
		expect(
			driftProblems({
				tokensCss: matchingTokensCss(reduced),
				tokenMap: reduced,
				pending: { rows: [] },
			}),
		).toEqual([{ code: "vacuous", subject: "adopt rows seen: 3" }]);
	});

	test("a pending row naming no adopt token or theme is unknown", () => {
		const problems = driftProblems({
			tokensCss: matchingTokensCss(TOKEN_MAP),
			tokenMap: TOKEN_MAP,
			pending: {
				rows: [
					{
						token: "--ec-color-nonexistent",
						theme: "light",
						reason: "planted pending row naming a token the map does not adopt",
					},
					{
						token: "--ec-color-bg",
						theme: "sepia",
						reason: "planted pending row naming a theme that does not exist",
					},
				],
			},
		});
		expect(problems).toEqual([
			{ code: "unknown-pending", subject: "--ec-color-nonexistent|light" },
			{ code: "unknown-pending", subject: "--ec-color-bg|sepia" },
		]);
	});
});
