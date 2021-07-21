import fs from "fs";
import path from "path";
import { resourcesPath } from "./resources.js";

// Locales list: https://www.electronjs.org/docs/api/locales
export enum Locale {
	Chinese = "zh",
	English = "en",
	French = "fr",
	German = "de",
	Italian = "it",
	Japanese = "ja",
	Polish = "pl",
	Portuguese = "pt",
	Russian = "ru",
	Spanish = "es",
}

type I18nStringSet = {
	[locale: string]: string;
};

type I18nStringsDictionary = {
	[key: string]: I18nStringSet;
};

let strings: I18nStringsDictionary | null = null;

export function i18n(key: string, locale: string): string {
	if (!strings) {
		throw new Error("i18n strings file not loaded");
	}

	const i18nString = strings[key];
	if (!i18nString) {
		throw new Error(
			`Could not find localization strings while reading text for ${key}`
		);
	}
	// prefer locale, then fallback locale, then default to English
	const text =
		i18nString[locale] ||
		i18nString[fallbackLocale(locale)] ||
		i18nString[Locale.English];
	if (!text) {
		throw new Error(`Could not find interface text for ${key}`);
	}

	return text;
}

export function preloadI18nStrings(): void {
	if (strings) {
		return;
	}

	strings = JSON.parse(stringsFile());
}

// Select a fallback for each "dialect" if it doesn't already
// have its own translation more specific than the main entry
// Locales list: https://www.electronjs.org/docs/api/locales
export function fallbackLocale(locale: string): string {
	switch (locale) {
		case "zh-CN": //Chinese (Simplified)
		case "zh-TW": //Chinese (Traditional)
			return Locale.Chinese;

		case "fr-CA": //French (Canada)
		case "fr-CH": //French (Switzerland)
		case "fr-FR": //French (France)
			return Locale.French;

		case "de-AT": //German (Austria)
		case "de-CH": //German (Switzerland)
		case "de-DE": //German (Germany)
			return Locale.German;

		case "pt-BR": //Portuguese (Brazil)
		case "pt-PT": //Portuguese (Portugal)
			return Locale.Portuguese;

		case "it-CH": //Italian (Switzerland)
		case "it-IT": //Italian (Italy)
			return Locale.Italian;

		case "es-419": //Spanish (Latin America)
			return Locale.Spanish;

		default:
			//default to English
			return Locale.English;
	}
}

function stringsFile() {
	return fs.readFileSync(stringsFilePath(), "utf8");
}

function stringsFilePath(): string {
	return path.join(resourcesPath(), "strings.json");
}
