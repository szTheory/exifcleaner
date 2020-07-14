import fs from "fs";
import path from "path";
import { isProd } from "./env";
import { prodResourcesPath, devResourcesPath } from "./resources";

let strings: I18nStringsDictionary | null = null;

type I18nStringSet = {
	[locale: string]: string;
};

type I18nStringsDictionary = {
	[key: string]: I18nStringSet;
};

export function i18n(key: string, locale: string): string {
	if (!strings) {
		throw new Error("i18n strings file not loaded");
	}

	const i18nString = strings[key];

	return i18nString[locale] || i18nString["en"];
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
