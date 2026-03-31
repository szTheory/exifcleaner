import fs from "fs";
import path from "path";
import { resourcesPath } from "./resources";
import { i18nLookup, type I18nStringsDictionary } from "../../domain/i18n_lookup";

let strings: I18nStringsDictionary | null = null;

export function i18n(key: string, locale: string): string {
	if (!strings) {
		throw new Error("i18n strings file not loaded");
	}
	return i18nLookup(strings, key, locale);
}

export function preloadI18nStrings(): void {
	if (strings) {
		return;
	}
	strings = JSON.parse(stringsFile());
}

export function getI18nStrings(): I18nStringsDictionary {
	if (!strings) {
		throw new Error("i18n strings not loaded");
	}
	return strings;
}

function stringsFile() {
	return fs.readFileSync(stringsFilePath(), "utf8");
}

function stringsFilePath(): string {
	return path.join(resourcesPath(), "strings.json");
}
