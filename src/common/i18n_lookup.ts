// Pure i18n lookup — no fs, path, or Node.js imports.
// Safe for renderer, preload, and main.

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
	Hungarian = "hu",
}

export type I18nStringSet = {
	[locale: string]: string;
};

export type I18nStringsDictionary = {
	[key: string]: I18nStringSet;
};

export function i18nLookup(
	strings: I18nStringsDictionary,
	key: string,
	locale: string,
): string {
	const i18nString = strings[key];
	if (!i18nString) {
		throw new Error(
			`Could not find localization strings while reading text for ${key}`,
		);
	}
	const text =
		i18nString[locale] ||
		i18nString[fallbackLocale(locale)] ||
		i18nString[Locale.English];
	if (!text) {
		throw new Error(`Could not find interface text for ${key}`);
	}
	return text;
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
