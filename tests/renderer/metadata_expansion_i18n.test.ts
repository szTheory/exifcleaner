import { describe, expect, it } from "vitest";
import { formatMetadataCount } from "../../src/renderer/components/file-list/MetadataExpansion";

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
