import fs from "fs";
import path from "path";
import { isProd } from "./env";
import { prodResourcesPath, devResourcesPath } from "./resources";

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

export function i18n(
	key: string,
	locale: string,
	fallbackLocale: string
): string {
	if (!strings) {
		throw new Error("i18n strings file not loaded");
	}

	const i18nString = strings[key];
	// prefer locale, then fallback locale, then default to English
	const text =
		i18nString[locale] ||
		i18nString[fallbackLocale] ||
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

function stringsFile() {
	return fs.readFileSync(stringsFilePath(), "utf8");
}

function stringsFilePath(): string {
	return path.join(
		isProd() ? prodResourcesPath() : devResourcesPath(),
		"strings.json"
	);
}
