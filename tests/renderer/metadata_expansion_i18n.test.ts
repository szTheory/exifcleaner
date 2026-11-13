import { composeStories } from "@storybook/react-vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LOCALE_DICTIONARY } from "../../.storybook/locale_dictionary";
import { i18nLookup } from "../../src/domain";
import { formatMetadataCount } from "../../src/renderer/components/file-list/MetadataExpansion";
import * as metadataExpansionStories from "../../src/renderer/components/file-list/MetadataExpansion.stories";
import { I18nContext } from "../../src/renderer/contexts/I18nContext";

describe("metadata count localization", () => {
	it("falls back to the other form for plural categories without dedicated copy", () => {
		const strings: Record<string, string> = {
			"metadata.removed.other": "{count} fields removed",
		};
		const lookup = (key: string): string => strings[key] ?? key;

		expect(
			formatMetadataCount({
				count: 2,
				locale: "ar",
				baseKey: "metadata.removed",
				i18nLookup: lookup,
			}),
		).toBe("2 fields removed");
	});

	it("uses a locale's dedicated category when one is supplied", () => {
		const lookup = (key: string): string =>
			key === "metadata.removed.two" ? "تمت إزالة حقلين" : key;

		expect(
			formatMetadataCount({
				count: 2,
				locale: "ar",
				baseKey: "metadata.removed",
				i18nLookup: lookup,
			}),
		).toBe("تمت إزالة حقلين");
	});
});

// SC3 / D-07: the stories' fixtures meet literal expectations from the unit-test side.
// The two stories are composed WITHOUT the project annotations and rendered with
// renderToStaticMarkup under the same I18nContext shape the real provider supplies
// (the English dictionary through the pure i18nLookup, the provider's try/catch).
// The preview's project annotations are deliberately not applied in this node
// environment (its ReadyGate renders nothing without a document), and the composed
// story's own run method is not used either (it needs a document), so no play
// function or decorator runs here; the story's `render` and `args` are what is proven.
// Tautology guard: every expected string below is typed out again; none is imported
// from the story or computed from the fixture, so a changed fixture map makes this
// test red as well as the story's play.
describe("composed MetadataExpansion stories (SC3)", () => {
	const { Mixed, Unchanged } = composeStories(metadataExpansionStories);

	function t(key: string): string {
		try {
			return i18nLookup({ strings: LOCALE_DICTIONARY, key, locale: "en" });
		} catch {
			return key;
		}
	}

	function markupOf(story: typeof Mixed): string {
		const element = createElement(story);
		return renderToStaticMarkup(
			createElement(
				I18nContext.Provider,
				{ value: { t, locale: "en", isLoading: false } },
				element,
			),
		);
	}

	it("renders Mixed with two fields removed and one still present", () => {
		const markup = markupOf(Mixed);
		expect(markup).toContain("2 fields removed \u00b7 1 field still present");
		expect(markup).toContain("<summary>1 field still present</summary>");
		expect(markup).toContain("Copy all");
		expect(markup).toContain('aria-label="tag2: removed"');
		expect(markup).toContain('aria-label="tag3: removed"');
		expect(markup).toContain('aria-label="tag1: preserved"');
		expect(markup).toContain('title="Other"');
	});

	it("renders Unchanged with no field removed and one still present", () => {
		const markup = markupOf(Unchanged);
		expect(markup).toContain("0 fields removed \u00b7 1 field still present");
		expect(markup).toContain('aria-label="Artist: preserved"');
		expect(markup).not.toContain("metadata-field--removed");
	});
});
