import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	ACCENT_SITES,
	BASELINE_PATH,
	colourLiteralsInSource,
	main,
	ratchetProblems,
	scanColourLiterals,
	type ColourLiteralRow,
	type ColourLiteralScan,
} from "../../../scripts/colour_literal_ratchet.mjs";

// GAT-03 / D-15: every colour literal under src/ outside tokens.css is keyed in a committed
// baseline (docs/evidence/colour-literals.json) by (file, normalised literal) with a count,
// and the scan must equal that baseline exactly. A new literal is red because its key is not
// listed; a removed literal is red until the baseline row is removed; a swapped literal is
// both. A bare integer total would let one literal be traded for another, which is why the
// baseline is keyed. #007AFF (the system accent) is held to its three sites: tokens.css 2
// and src/domain/accent_color.ts 1. The pending-list and baseline may only shrink against
// the merge-base (scripts/shrink_only_check.mjs, D-10); that check needs git history, so it
// runs as a CLI in CI and is unit-tested separately.
//
// The scan excludes stories and story_support (test support, never bundled), strips comments
// first, and counts named colours only where a colour is meant: in a CSS colour-bearing
// declaration or custom property, or as the quoted value of a colour attribute in a script.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const TOKENS_CSS = "src/renderer/styles/tokens.css";
const ACCENT_TS = "src/domain/accent_color.ts";

interface BaselineDocument {
	schemaVersion: number;
	rows: ColourLiteralRow[];
}

const BASELINE = JSON.parse(
	fs.readFileSync(path.join(REPO, BASELINE_PATH), "utf8"),
) as BaselineDocument;

const made: string[] = [];

afterEach(() => {
	for (const dir of made.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

function makeTree(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "colour-literal-"));
	made.push(root);
	for (const [rel, text] of Object.entries(files)) {
		const target = path.join(root, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, text);
	}
	return root;
}

function baselineOf(scan: ColourLiteralScan): BaselineDocument {
	return { schemaVersion: 1, rows: scan.rows };
}

// The two files that hold the system accent, so a temp tree satisfies the #007AFF rule.
const ACCENT_FILES: Record<string, string> = {
	[TOKENS_CSS]:
		':root { --a: #007AFF; } [data-theme="dark"] { --a: #007AFF; }\n',
	[ACCENT_TS]: 'export const ACCENT = "#007AFF";\n',
};

function keys(rows: ColourLiteralRow[]): string[] {
	return rows.map((row) => `${row.file}|${row.literal}|${row.count}`);
}

describe("GAT-03 colour-literal ratchet over the real tree (D-15)", () => {
	const scan = scanColourLiterals({ root: REPO });

	test("the scan equals the committed baseline exactly", () => {
		expect(scan.rows).toEqual(BASELINE.rows);
		expect(ratchetProblems({ scan, baseline: BASELINE })).toEqual([]);
	});

	test("the baseline is keyed rows, sorted, with no duplicate key and a positive count", () => {
		expect(BASELINE.schemaVersion).toBe(1);
		const seen = new Set<string>();
		for (const row of BASELINE.rows) {
			expect(row.count).toBeGreaterThan(0);
			expect(Number.isInteger(row.count)).toBe(true);
			const key = `${row.file}|${row.literal}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
		const sorted = [...BASELINE.rows].sort(
			(a, b) =>
				(a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
				(a.literal < b.literal ? -1 : a.literal > b.literal ? 1 : 0),
		);
		expect(BASELINE.rows).toEqual(sorted);
	});

	test("anti-vacuity: the scan read the known stylesheets and the two TypeScript files", () => {
		const files = new Set(scan.rows.map((row) => row.file));
		expect(files.has("src/renderer/styles/empty_state.css")).toBe(true);
		expect(files.has("src/renderer/styles/language_dropdown.css")).toBe(true);
		expect(files.has(ACCENT_TS)).toBe(true);
		expect(files.has("src/main/window/window_background.ts")).toBe(true);
		expect(scan.rows.length).toBeGreaterThanOrEqual(20);
	});

	test("tokens.css is the one file the baseline does not hold", () => {
		expect(scan.rows.some((row) => row.file === TOKENS_CSS)).toBe(false);
		expect(BASELINE.rows.some((row) => row.file === TOKENS_CSS)).toBe(false);
	});

	test("window_setup.ts holds no colour literal after the GAT-02 extraction (R11)", () => {
		expect(
			BASELINE.rows.some(
				(row) => row.file === "src/main/window/window_setup.ts",
			),
		).toBe(false);
	});

	test("#007AFF is held to tokens.css 2 and accent_color.ts 1, nowhere else", () => {
		expect(ACCENT_SITES).toEqual({ [ACCENT_TS]: 1, [TOKENS_CSS]: 2 });
		expect(scan.accent).toEqual({ [ACCENT_TS]: 1, [TOKENS_CSS]: 2 });
		const accentRows = BASELINE.rows.filter((row) => row.literal === "#007aff");
		expect(accentRows).toEqual([
			{ file: ACCENT_TS, literal: "#007aff", count: 1 },
		]);
	});
});

describe("GAT-03 scan behaviour on temp trees", () => {
	test("a planted color: #123456 in a stylesheet is a row the baseline lacks", () => {
		const root = makeTree({
			"src/renderer/styles/a.css": ".a { color: #ffffff; }\n",
			...ACCENT_FILES,
		});
		const clean = scanColourLiterals({ root });
		const baseline = baselineOf(clean);
		expect(ratchetProblems({ scan: clean, baseline })).toEqual([]);
		fs.writeFileSync(
			path.join(root, "src/renderer/styles/planted.css"),
			".planted { color: #123456; }\n",
		);
		const planted = scanColourLiterals({ root });
		const problems = ratchetProblems({ scan: planted, baseline });
		expect(problems.map((problem) => problem.code)).toEqual(["unlisted"]);
		expect(problems[0]?.message).toContain("src/renderer/styles/planted.css");
		expect(problems[0]?.message).toContain("#123456");
	});

	test("a literal that left the tree is a stale baseline row", () => {
		const root = makeTree({
			"src/renderer/styles/a.css":
				".a { color: #ffffff; background: #000000; }\n",
			...ACCENT_FILES,
		});
		const before = baselineOf(scanColourLiterals({ root }));
		fs.writeFileSync(
			path.join(root, "src/renderer/styles/a.css"),
			".a { color: #ffffff; }\n",
		);
		const problems = ratchetProblems({
			scan: scanColourLiterals({ root }),
			baseline: before,
		});
		expect(problems.map((problem) => problem.code)).toEqual(["stale"]);
	});

	test("a raised count is a count problem and a swapped literal is two problems", () => {
		const root = makeTree({
			"src/renderer/styles/a.css": ".a { color: #ffffff; }\n",
			...ACCENT_FILES,
		});
		const baseline = baselineOf(scanColourLiterals({ root }));
		fs.writeFileSync(
			path.join(root, "src/renderer/styles/a.css"),
			".a { color: #ffffff; } .b { color: #ffffff; }\n",
		);
		expect(
			ratchetProblems({ scan: scanColourLiterals({ root }), baseline }).map(
				(problem) => problem.code,
			),
		).toEqual(["count"]);
		fs.writeFileSync(
			path.join(root, "src/renderer/styles/a.css"),
			".a { color: #eeeeee; }\n",
		);
		expect(
			ratchetProblems({ scan: scanColourLiterals({ root }), baseline })
				.map((problem) => problem.code)
				.sort(),
		).toEqual(["stale", "unlisted"]);
	});

	test("comments are stripped before the scan, in CSS and in scripts", () => {
		const root = makeTree({
			"src/renderer/styles/a.css":
				"/* #123456 and rgba(1, 2, 3, 0.4) */\n.a { color: #ffffff; }\n",
			"src/renderer/utils/exif.ts":
				"// the colour #344 appears only in this comment\n/* block #abcdef */\nexport const x = 1;\n",
		});
		expect(keys(scanColourLiterals({ root }).rows)).toEqual([
			"src/renderer/styles/a.css|#ffffff|1",
		]);
	});

	test("a story file and a story_support file are not scanned (asserted exclusion)", () => {
		const root = makeTree({
			"src/renderer/components/X.stories.tsx": 'export const c = "#123456";\n',
			"src/renderer/components/Y.stories.ts": 'export const c = "#123456";\n',
			"src/renderer/story_support/boundary_data.ts":
				'export const c = "#654321";\n',
			"src/renderer/components/Real.tsx": 'export const c = "#abcdef";\n',
		});
		expect(keys(scanColourLiterals({ root }).rows)).toEqual([
			"src/renderer/components/Real.tsx|#abcdef|1",
		]);
	});

	test("tokens.css is not in the rows but its #007AFF counts toward the accent rule", () => {
		const root = makeTree({
			[TOKENS_CSS]:
				':root { --a: #007AFF; --b: #fff; } [data-theme="dark"] { --a: #007aff; }\n',
			[ACCENT_TS]: 'export const ACCENT = "#007AFF";\n',
		});
		const scan = scanColourLiterals({ root });
		expect(keys(scan.rows)).toEqual([`${ACCENT_TS}|#007aff|1`]);
		expect(scan.accent).toEqual({ [ACCENT_TS]: 1, [TOKENS_CSS]: 2 });
		expect(ratchetProblems({ scan, baseline: baselineOf(scan) })).toEqual([]);
	});

	test("a third #007AFF site is an accent problem even when the baseline lists it", () => {
		const root = makeTree({
			[TOKENS_CSS]:
				':root { --a: #007AFF; } [data-theme="dark"] { --a: #007AFF; }\n',
			[ACCENT_TS]: 'export const ACCENT = "#007AFF";\n',
			"src/renderer/styles/extra.css": ".x { color: #007aff; }\n",
		});
		const scan = scanColourLiterals({ root });
		const problems = ratchetProblems({ scan, baseline: baselineOf(scan) });
		expect(problems.map((problem) => problem.code)).toEqual(["accent"]);
		expect(problems[0]?.message).toContain("src/renderer/styles/extra.css");
	});

	test("a missing accent site is an accent problem", () => {
		const root = makeTree({
			[TOKENS_CSS]: ":root { --a: #007AFF; }\n",
			[ACCENT_TS]: 'export const ACCENT = "#007AFF";\n',
		});
		const scan = scanColourLiterals({ root });
		const problems = ratchetProblems({ scan, baseline: baselineOf(scan) });
		expect(problems.map((problem) => problem.code)).toEqual(["accent"]);
		expect(problems[0]?.message).toContain(TOKENS_CSS);
	});

	test("a root without src/ fails closed instead of scanning zero files", () => {
		expect(() => scanColourLiterals({ root: makeTree({}) })).toThrow();
	});

	test("a malformed baseline is a shape problem, not an exception", () => {
		const scan = scanColourLiterals({
			root: makeTree({ "src/renderer/styles/a.css": ".a { margin: 0; }\n" }),
		});
		for (const baseline of [null, 3, {}, { schemaVersion: 1 }, { rows: "x" }]) {
			expect(
				ratchetProblems({ scan, baseline }).map((problem) => problem.code),
			).toContain("shape");
		}
	});

	test("the CLI writes the baseline, passes on it, and is red on a planted literal", () => {
		const root = makeTree({
			"src/renderer/styles/a.css": ".a { color: #ffffff; }\n",
			[TOKENS_CSS]:
				':root { --a: #007AFF; } [data-theme="dark"] { --a: #007AFF; }\n',
			[ACCENT_TS]: 'export const ACCENT = "#007AFF";\n',
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		expect(main(["--write"], { root })).toBe(0);
		const written = fs.readFileSync(path.join(root, BASELINE_PATH), "utf8");
		expect(written.endsWith("\n")).toBe(true);
		expect(written).toContain('\t"schemaVersion": 1');
		expect(main(["--check"], { root })).toBe(0);
		fs.writeFileSync(
			path.join(root, "src/renderer/styles/planted.css"),
			".planted { color: #123456; }\n",
		);
		expect(main(["--check"], { root })).toBe(1);
		expect(error.mock.calls.flat().join("\n")).toContain("#123456");
		expect(log).toHaveBeenCalled();
		expect(main([], { root })).toBe(1);
		expect(main(["--write", "--check"], { root })).toBe(1);
	});
});

describe("GAT-03 literal grammar (colourLiteralsInSource)", () => {
	const css = (text: string): string[] =>
		colourLiteralsInSource({ file: "src/renderer/styles/x.css", text });
	const script = (text: string, file = "src/renderer/utils/x.tsx"): string[] =>
		colourLiteralsInSource({ file, text });
	// The scan returns code-unit order, not source order.
	const sorted = (values: string[]): string[] => [...values].sort();

	test("hex literals are counted and normalised, so #FFF and #fff are one key", () => {
		expect(css(".a { color: #FFF; background: #fff; }")).toEqual([
			"#fff",
			"#fff",
		]);
	});

	test("rgba shadows are counted and whitespace-normalised", () => {
		expect(
			css(
				".a { box-shadow: 0 1px 2px RGBA( 0,0,0,0.2 ), 0 0 1px rgba(0, 0, 0, 0.04); }",
			),
		).toEqual(sorted(["rgba(0, 0, 0, 0.2)", "rgba(0, 0, 0, 0.04)"]));
	});

	test("hsl, hsla, oklch and color-mix are counted as whole calls", () => {
		expect(
			css(
				".a { color: hsl(210 50% 40%); background: HSLA(10, 20%, 30%, 0.5); border-color: oklch(0.7 0.1 200); outline-color: color-mix(in srgb, #fff 50%, black); }",
			),
		).toEqual(
			sorted([
				"hsl(210 50% 40%)",
				"hsla(10, 20%, 30%, 0.5)",
				"oklch(0.7 0.1 200)",
				"color-mix(in srgb, #fff 50%, black)",
			]),
		);
	});

	test("a colour inside a color-mix call is not counted a second time", () => {
		expect(
			css(".a { color: color-mix(in srgb, #fff 50%, rgba(0, 0, 0, 0.5)); }"),
		).toEqual(["color-mix(in srgb, #fff 50%, rgba(0, 0, 0, 0.5))"]);
	});

	test("named colours count in colour-bearing declarations and custom properties", () => {
		expect(
			css(
				".a { color: red; background: Tomato; border: 1px solid tan; box-shadow: 0 0 1px gold; --custom: rebeccapurple; fill: transparent; }",
			),
		).toEqual(
			sorted(["red", "tomato", "tan", "gold", "rebeccapurple", "transparent"]),
		);
	});

	test("white and black count in colour-bearing declarations only", () => {
		expect(css(".a { color: white; background: black; }")).toEqual(
			sorted(["white", "black"]),
		);
		expect(css('.a { content: "white"; font-family: Black, white; }')).toEqual(
			[],
		);
	});

	test("a colour word inside an identifier, a string or a non-colour property is not a literal", () => {
		expect(
			css(
				'.a { color: var(--ec-color-red); background: var(--ec-white); content: "red"; font-family: Linen, "Gold"; animation-name: tan-fade; margin: 0; }',
			),
		).toEqual([]);
		expect(css(".a { --font: 'Tomato', serif; --ok: none; }")).toEqual([]);
	});

	test("a var() fallback colour is a literal", () => {
		expect(
			css(".a { color: var(--ec-color-x, red); background: var(--y, #fff); }"),
		).toEqual(sorted(["red", "#fff"]));
	});

	test("script text counts hex, rgb, hsl, oklch and color-mix but never prose words", () => {
		expect(
			script(
				'const a = "#abcdef"; const b = `rgba(1, 2, 3, 0.4)`; const c = "hsl(1 2% 3%)"; const d = "oklch(0.7 0.1 200)"; const e = "color-mix(in srgb, red 50%, blue)";',
			),
		).toEqual(
			sorted([
				"#abcdef",
				"rgba(1, 2, 3, 0.4)",
				"hsl(1 2% 3%)",
				"oklch(0.7 0.1 200)",
				"color-mix(in srgb, red 50%, blue)",
			]),
		);
		expect(
			script(
				'const white = 1; const label = "black and white, red apple"; const t = "Transparent window";',
			),
		).toEqual([]);
		expect(script("// a #123456 comment\nexport const x = 1;")).toEqual([]);
	});

	test("a script names a colour only as the quoted value of a colour attribute", () => {
		expect(script('<path fill="white" stroke="red" d="M0 0" />')).toEqual(
			sorted(["white", "red"]),
		);
		expect(
			script("const s = { color: 'tomato', background: \"transparent\" };"),
		).toEqual(sorted(["tomato", "transparent"]));
		expect(script('<path fill="currentColor" stroke="none" />')).toEqual([]);
		expect(script('<Badge color={"red"} />')).toEqual(["red"]);
		expect(script('const t = { colour: "red", name: "red" };')).toEqual([]);
	});

	test("a CSS file is read through its declarations, not as raw text", () => {
		expect(css("/* color: red; */ .a { margin: 0; }")).toEqual([]);
	});
});
