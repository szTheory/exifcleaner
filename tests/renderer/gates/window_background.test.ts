import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { windowBackgroundColor } from "../../../src/main/window/window_background";
import {
	THEMES,
	resolveColour,
	themeTokens,
	type ContrastTheme,
} from "../contrast/contrast_model.mjs";
import { parseColour } from "../contrast/wcag.mjs";

// GAT-02 / D-14: the window's first-paint background is what a user sees before the
// renderer has painted, so it must equal the page ground (`--ec-color-bg`) in both themes,
// or the window flashes a different colour on every launch. The colour lives in the pure
// module src/main/window/window_background.ts; this test compares it, as a parsed colour
// and not as a string (the hex case differs), with `--ec-color-bg` resolved from tokens.css
// for each theme through the shared contrast resolver.
//
// Orphan guard: a test of constants the window no longer reads would pass while the window
// shows another colour, so the test also reads window_setup.ts as text and requires that it
// calls windowBackgroundColor( and holds no colour literal of its own. Phase 77 moves the
// constants and the tokens together; this test's code stays unchanged then.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

function readText(relPath: string): string {
	return fs.readFileSync(path.join(REPO, relPath), "utf8");
}

const TOKENS_CSS = readText("src/renderer/styles/tokens.css");

// A hex, rgb or hsl colour literal anywhere in the text.
function hasColourLiteral(text: string): boolean {
	return /#[0-9a-fA-F]{3,8}\b/.test(text) || /(?:rgba?|hsla?)\(/i.test(text);
}

interface BackgroundProblem {
	theme: ContrastTheme;
	reason: "mismatch" | "unresolved";
}

export function windowBackgroundProblems({
	tokensCss,
	colourFor,
}: {
	tokensCss: string;
	colourFor: (isDark: boolean) => string;
}): BackgroundProblem[] {
	const problems: BackgroundProblem[] = [];
	const tokens = themeTokens(tokensCss);
	for (const theme of THEMES) {
		const want = resolveColour("--ec-color-bg", theme, tokens, {});
		const got = parseColour(colourFor(theme === "dark"));
		if (want === null || got === null) {
			problems.push({ theme, reason: "unresolved" });
		} else if (
			want.r !== got.r ||
			want.g !== got.g ||
			want.b !== got.b ||
			want.a !== got.a
		) {
			problems.push({ theme, reason: "mismatch" });
		}
	}
	return problems;
}

describe("GAT-02 window background equals --ec-color-bg (D-14)", () => {
	test("the real function and the real tokens.css agree in both themes", () => {
		expect(
			windowBackgroundProblems({
				tokensCss: TOKENS_CSS,
				colourFor: windowBackgroundColor,
			}),
		).toEqual([]);
	});

	test("the two values are the page grounds the user sees (anti-vacuity)", () => {
		expect(windowBackgroundColor(false).toLowerCase()).toBe("#f5f6f8");
		expect(windowBackgroundColor(true).toLowerCase()).toBe("#141416");
		expect(
			resolveColour("--ec-color-bg", "dark", themeTokens(TOKENS_CSS), {}),
		).not.toBeNull();
		expect(THEMES.length).toBe(2);
	});

	test("negative control: a planted wrong dark colour is reported for dark only", () => {
		expect(
			windowBackgroundProblems({
				tokensCss: TOKENS_CSS,
				colourFor: (isDark) =>
					isDark ? "#1e1e1e" : windowBackgroundColor(false),
			}),
		).toEqual([{ theme: "dark", reason: "mismatch" }]);
	});

	test("negative control: a planted theme map whose dark ground moved is reported for dark", () => {
		const planted = TOKENS_CSS.replace(
			/(\[data-theme="dark"\][^}]*--ec-color-bg:\s*)#141416/,
			"$1#0a2e2b",
		);
		expect(planted).not.toBe(TOKENS_CSS);
		expect(
			windowBackgroundProblems({
				tokensCss: planted,
				colourFor: windowBackgroundColor,
			}),
		).toEqual([{ theme: "dark", reason: "mismatch" }]);
	});

	test("a colour that does not parse is reported, never treated as equal", () => {
		expect(
			windowBackgroundProblems({
				tokensCss: TOKENS_CSS,
				colourFor: () => "not-a-colour",
			}),
		).toEqual([
			{ theme: "light", reason: "unresolved" },
			{ theme: "dark", reason: "unresolved" },
		]);
	});

	test("window_setup.ts calls windowBackgroundColor( and holds no colour literal (orphan guard)", () => {
		const setup = readText("src/main/window/window_setup.ts");
		expect(setup).toContain("windowBackgroundColor(");
		expect(hasColourLiteral(setup)).toBe(false);
	});

	test("the orphan guard is red on a window_setup.ts that kept its own constants", () => {
		const setup = readText("src/main/window/window_setup.ts");
		for (const planted of [
			'const DARK_BACKGROUND_COLOR = "#1e1e1e";',
			'const BACKGROUND = "rgb(30, 30, 30)";',
			'const BACKGROUND = "hsl(0 0% 12%)";',
		]) {
			expect(hasColourLiteral(`${setup}\n${planted}\n`)).toBe(true);
		}
	});
});
