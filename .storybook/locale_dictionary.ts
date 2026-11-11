/// <reference types="vite/client" />
// The directive above types `import.meta.glob`; without it tsc reports TS2339.

import type { I18nStringsDictionary } from "../src/domain";

function isStringMap(value: unknown): value is Record<string, string> {
	return (
		typeof value === "object" &&
		value !== null &&
		Object.values(value).every((text) => typeof text === "string")
	);
}

// Folds the per-locale files into the `strings.json` shape (the same fold as
// scripts/i18n_resources.mjs: English keys in order, a locale that lacks a key
// is skipped for that key). The Node-side loader in src/infrastructure/electron
// must not be imported here: it uses `fs`, which a browser bundle cannot.
export function buildDictionary(
	files: Record<string, unknown>,
): I18nStringsDictionary {
	const locales = Object.entries(files).map(([file, content]) => {
		const code = file.replace(/^.*\//, "").replace(/\.json$/, "");
		if (!isStringMap(content)) {
			throw new Error(`${file} must be a flat key to string map`);
		}
		return [code, content] as const;
	});
	const english = locales.find(([code]) => code === "en");
	if (english === undefined) {
		throw new Error("en.json is missing from the locale files");
	}
	const dictionary: I18nStringsDictionary = {};
	for (const key of Object.keys(english[1])) {
		const entry: Record<string, string> = {};
		for (const [code, strings] of locales) {
			if (!(key in strings)) continue;
			const value = strings[key];
			if (value !== undefined) entry[code] = value;
		}
		dictionary[key] = entry;
	}
	return dictionary;
}

export const LOCALE_FILES: Record<string, unknown> = import.meta.glob(
	"../.resources/locales/*.json",
	{ eager: true, import: "default" },
);

export const LOCALE_DICTIONARY = buildDictionary(LOCALE_FILES);
