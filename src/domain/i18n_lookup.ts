// Pure i18n lookup — no fs, path, or Node.js imports.
// Safe for renderer, preload, and main.

export enum Locale {
	Arabic = "ar",
	Catalan = "ca",
	Chinese = "zh",
	Croatian = "hr",
	Czech = "cs",
	Danish = "da",
	Dutch = "nl",
	English = "en",
	French = "fr",
	German = "de",
	Hungarian = "hu",
	Italian = "it",
	Japanese = "ja",
	Malayalam = "ml",
	Persian = "fa",
	Polish = "pl",
	Portuguese = "pt",
	PortugueseBR = "pt-BR",
	Russian = "ru",
	Slovak = "sk",
	Spanish = "es",
	Swedish = "sv",
	Turkish = "tr",
	Ukrainian = "uk",
	Vietnamese = "vn",
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

		case "pt-BR": // Portuguese (Brazil) -- has its own translations
			return Locale.PortugueseBR;
		case "pt-PT": // Portuguese (Portugal)
			return Locale.Portuguese;

		case "it-CH": //Italian (Switzerland)
		case "it-IT": //Italian (Italy)
			return Locale.Italian;

		case "es-419": //Spanish (Latin America)
			return Locale.Spanish;

		case "hr-HR": // Croatian (Croatia)
			return Locale.Croatian;

		case "vi": // Vietnamese (Electron reports "vi", strings.json uses "vn")
			return Locale.Vietnamese;

		default:
			//default to English
			return Locale.English;
	}
}
