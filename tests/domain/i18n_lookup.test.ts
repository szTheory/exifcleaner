import { describe, expect, it } from "vitest";
import {
	fallbackLocale,
	i18nLookup,
	Locale,
} from "../../src/domain/i18n/i18n_lookup";

describe("Romanian localization", () => {
	it("maps the Electron ro-RO locale to Romanian", () => {
		expect(fallbackLocale({ locale: "ro-RO" })).toBe(Locale.Romanian);
	});

	it("uses Romanian for an ro-RO lookup", () => {
		expect(
			i18nLookup({
				strings: {
					"empty.title": {
						en: "Add files to clean",
						ro: "Niciun fișier selectat",
					},
				},
				key: "empty.title",
				locale: "ro-RO",
			}),
		).toBe("Niciun fișier selectat");
	});
});
