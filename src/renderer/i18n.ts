import electron from "electron";
import { preloadI18nStrings, i18n } from "../common/i18n";
import { Locale } from "../common/i18n";

const ATTRIBUTE_I18N = "i18n";

export function setupI18n(): void {
	preloadI18nStrings();
	const locale = electron.remote.app.getLocale();

	translateHtml(locale);
}

// Select a fallback for each "dialect" if it doesn't already
// have its own translation more specific than the main entry
function getFallbackLocale(locale: string): string {
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

function translateHtml(locale: string) {
	const fallbackLocale = getFallbackLocale(locale);

	const elements = document.querySelectorAll(`[${ATTRIBUTE_I18N}]`);
	elements.forEach((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Tried to localize a non-HTML element");
		}

		const key = element.getAttribute(ATTRIBUTE_I18N);
		if (!key) {
			throw new Error(`Could not find an HTML element to localize for: ${key}`);
		}

		element.innerText = i18n(key, locale, fallbackLocale);
	});
}
