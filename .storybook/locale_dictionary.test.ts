import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	LOCALE_DICTIONARY,
	LOCALE_FILES,
	buildDictionary,
} from "./locale_dictionary";

// WR-04 (D-19): the locale count follows the directory, so adding a locale file cannot
// turn this red by itself; `> 0` keeps the derivation from going vacuous.
const LOCALE_COUNT = readdirSync(
	path.resolve(import.meta.dirname, "../.resources/locales"),
).filter((file) => file.endsWith(".json")).length;

const STRINGS_JSON: unknown = JSON.parse(
	readFileSync(
		path.resolve(import.meta.dirname, "../.resources/strings.json"),
		"utf8",
	),
);

describe("storybook locale dictionary", () => {
	test("is the same dictionary the app ships (.resources/strings.json)", () => {
		// Anti-vacuity: the glob found every locale file.
		expect(LOCALE_COUNT).toBeGreaterThan(0);
		expect(Object.keys(LOCALE_FILES)).toHaveLength(LOCALE_COUNT);
		expect(LOCALE_DICTIONARY).toEqual(STRINGS_JSON);
	});

	test("the English column holds every key the stories use", () => {
		for (const key of ["languageSystem", "language"]) {
			const entry = LOCALE_DICTIONARY[key];
			expect(entry, key).toBeDefined();
			expect(entry?.["en"], key).toEqual(expect.any(String));
			expect(entry?.["fa"], key).toEqual(expect.any(String));
			expect(entry?.["ar"], key).toEqual(expect.any(String));
		}
	});

	test.each(["fa", "ar", "de"])(
		"negative control: a dictionary built without %s.json no longer equals strings.json",
		(locale) => {
			const without = Object.fromEntries(
				Object.entries(LOCALE_FILES).filter(
					([file]) => !file.endsWith(`/${locale}.json`),
				),
			);
			expect(Object.keys(without)).toHaveLength(LOCALE_COUNT - 1);
			expect(buildDictionary(without)).not.toEqual(STRINGS_JSON);
		},
	);

	test("a locale that lacks a key is skipped for that key, not filled in", () => {
		const dictionary = buildDictionary({
			"../.resources/locales/en.json": { a: "A", b: "B" },
			"../.resources/locales/fr.json": { a: "AA" },
		});
		expect(dictionary).toEqual({
			a: { en: "A", fr: "AA" },
			b: { en: "B" },
		});
	});

	test("rejects a locale file that is not a flat string map", () => {
		expect(() =>
			buildDictionary({
				"../.resources/locales/en.json": { a: "A" },
				"../.resources/locales/xx.json": { a: 1 },
			}),
		).toThrow(/flat key to string map/);
	});
});
