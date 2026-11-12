import { describe, expect, test } from "vitest";
import {
	listRendererSources,
	scanRenderer,
	scanSource,
	uniquePairs,
} from "./hardcoded_scan.mjs";
import { repoRoot } from "./temp_repo";

// The renderer's hardcoded strings, as of Phase 71 (RESEARCH C3: 18 unique
// (path, literal) pairs from 22 raw hits, not 17). A string added to or removed
// from a renderer .tsx file changes this list on purpose.
const PINNED: ReadonlyArray<[string, string, string]> = [
	[
		"src/renderer/components/file-list/ErrorExpansion.tsx",
		"Click to copy",
		"jsx-text",
	],
	["src/renderer/components/icons/GearIcon.tsx", "Close settings", "attribute"],
	["src/renderer/components/icons/GearIcon.tsx", "Open settings", "attribute"],
	[
		"src/renderer/components/settings/LanguageDropdown.tsx",
		"Language",
		"t-fallback",
	],
	[
		"src/renderer/components/settings/LanguageDropdown.tsx",
		"System",
		"t-fallback",
	],
	[
		"src/renderer/components/settings/SettingsDrawer.tsx",
		"Appearance",
		"t-fallback",
	],
	["src/renderer/components/settings/SettingsDrawer.tsx", "Auto", "t-fallback"],
	[
		"src/renderer/components/settings/SettingsDrawer.tsx",
		"Close settings",
		"t-fallback",
	],
	["src/renderer/components/settings/SettingsDrawer.tsx", "Dark", "t-fallback"],
	[
		"src/renderer/components/settings/SettingsDrawer.tsx",
		"Language",
		"t-fallback",
	],
	[
		"src/renderer/components/settings/SettingsDrawer.tsx",
		"Light",
		"t-fallback",
	],
	[
		"src/renderer/components/settings/SettingsDrawer.tsx",
		"Settings",
		"t-fallback",
	],
	[
		"src/renderer/components/ui/ErrorBoundary.tsx",
		"Something went wrong.",
		"jsx-text",
	],
	["src/renderer/components/ui/ErrorBoundary.tsx", "Try again", "jsx-text"],
	["src/renderer/components/ui/StatusIcon.tsx", "Complete", "attribute"],
	["src/renderer/components/ui/StatusIcon.tsx", "Error", "attribute"],
	["src/renderer/components/ui/StatusIcon.tsx", "Pending", "attribute"],
	["src/renderer/components/ui/StatusIcon.tsx", "Processing", "attribute"],
];

describe("scanRenderer over the real tree", () => {
	test("yields exactly the 18 seeded unique pairs (non-vacuity)", () => {
		const pairs = uniquePairs(scanRenderer(repoRoot)).map(
			(pair) => [pair.path, pair.literal, pair.kind] as const,
		);
		expect(pairs).toEqual(PINNED);
		expect(pairs).toHaveLength(18);
	});

	test("22 raw hits collapse to 18 pairs, so the precedence rule is exercised", () => {
		expect(scanRenderer(repoRoot).length).toBe(22);
	});

	test("story files are never listed", () => {
		const files = listRendererSources(repoRoot);
		expect(files.length).toBeGreaterThan(15);
		expect(files.some((file) => file.includes(".stories."))).toBe(false);
		expect(files).toContain(
			"src/renderer/components/settings/LanguageDropdown.tsx",
		);
		expect(files).toEqual([...files].sort());
	});
});

describe("scanSource planted cases", () => {
	test("shown red: a planted <p>Click here</p> is reported as jsx-text", () => {
		const found = scanSource(
			"planted.tsx",
			"export const A = () => <p>Click here</p>;\n",
		);
		expect(found).toEqual([
			{ path: "planted.tsx", line: 1, literal: "Click here", kind: "jsx-text" },
		]);
	});

	test("a t(..) || literal is t-fallback even inside an aria-label attribute", () => {
		const source =
			'export const A = () => <button aria-label={t("x") || "Fallback"} />;\n';
		const found = scanSource("planted.tsx", source);
		expect(found.map((item) => item.kind).sort()).toEqual([
			"attribute",
			"t-fallback",
		]);
		expect(uniquePairs(found)).toEqual([
			{ path: "planted.tsx", literal: "Fallback", kind: "t-fallback" },
		]);
	});

	test("literals under an attribute expression count, call arguments do not", () => {
		const source =
			'export const A = () => <b title={open ? "Close it" : "Open it"} alt={t("only.key")} />;\n';
		expect(
			scanSource("planted.tsx", source).map((item) => item.literal),
		).toEqual(["Close it", "Open it"]);
	});

	test("translated text, one-letter text and unlisted attributes are not reported", () => {
		const source = [
			'export const A = () => (<div className="plain" data-id="visible text"><i>x</i>{t("key")}</div>);',
			"",
		].join("\n");
		expect(scanSource("planted.tsx", source)).toEqual([]);
	});

	test("multi-line text is one literal with collapsed whitespace", () => {
		const source =
			"export const A = () => (\n\t<p>\n\t\tTry\n\t\tagain\n\t</p>\n);\n";
		expect(
			scanSource("planted.tsx", source).map((item) => item.literal),
		).toEqual(["Try again"]);
	});
});
