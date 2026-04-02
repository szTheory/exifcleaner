import { describe, it, expect } from "vitest";
import { LANGUAGE_NAMES } from "../../src/domain/i18n/language_names";
import { Locale } from "../../src/domain/i18n/i18n_lookup";

describe("LANGUAGE_NAMES", () => {
	it("has exactly 25 entries", () => {
		expect(LANGUAGE_NAMES).toHaveLength(25);
	});

	it("is sorted alphabetically by nativeName", () => {
		const names = LANGUAGE_NAMES.map((l) => l.nativeName);
		const sorted = [...names].sort((a, b) => a.localeCompare(b));
		expect(names).toEqual(sorted);
	});

	it("has no duplicate codes", () => {
		const codes = LANGUAGE_NAMES.map((l) => l.code);
		const unique = new Set(codes);
		expect(unique.size).toBe(codes.length);
	});

	it("covers every Locale enum value", () => {
		const codes = new Set(LANGUAGE_NAMES.map((l) => l.code));
		for (const value of Object.values(Locale)) {
			expect(codes.has(value)).toBe(true);
		}
	});

	it("each entry has non-empty nativeName and englishName", () => {
		for (const entry of LANGUAGE_NAMES) {
			expect(entry.nativeName.length).toBeGreaterThan(0);
			expect(entry.englishName.length).toBeGreaterThan(0);
			expect(entry.code.length).toBeGreaterThan(0);
		}
	});
});
