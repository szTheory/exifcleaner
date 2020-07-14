import electron from "electron";
import { preloadI18nStrings, i18n } from "../common/i18n";

const ATTRIBUTE_I18N = "i18n";

export function setupI18n(): void {
	preloadI18nStrings();
	const locale = electron.remote.app.getLocale();
	// console.log(`Locale: ${locale}`);
	translateHtml(locale);
}

function fallbackLocale(locale: string) {
	switch (locale) {
		case "fr": //French
		case "fr-CA": //French (Canada)
		case "fr-CH": //French (Switzerland)
		case "fr-FR": //French (France)
			return "fr";

		case "es": //Spanish
		case "es-419": //Spanish (Latin America)
			return "es";

		default:
			return "en";
	}
}

function translateHtml(locale: string) {
	locale = fallbackLocale(locale);

	const elements = document.querySelectorAll(`[${ATTRIBUTE_I18N}]`);
	elements.forEach((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Tried to localize a non-HTML element");
		}

		const key = element.getAttribute(ATTRIBUTE_I18N);
		if (!key) {
			throw new Error(`Could not find an HTML element to localize for: ${key}`);
		}
		console.log("key: " + key);
		const text = i18n(key, locale);
		console.log("text: " + text);

		element.innerText = text;
	});
}
