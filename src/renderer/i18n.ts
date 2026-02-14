import { i18nLookup } from "../common/i18n_lookup";
import type { I18nStringsDictionary } from "../common/i18n_lookup";

const ATTRIBUTE_I18N = "i18n";
let cachedStrings: I18nStringsDictionary | null = null;

export async function setupI18n(): Promise<void> {
	cachedStrings = await window.api.i18n.getStrings();
	await translateHtml();
}

async function translateHtml() {
	const locale = await window.api.i18n.getLocale();
	const elements = document.querySelectorAll(`[${ATTRIBUTE_I18N}]`);

	elements.forEach((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("Tried to localize a non-HTML element");
		}

		const key = element.getAttribute(ATTRIBUTE_I18N);
		if (!key) {
			throw new Error(`Could not find an HTML element to localize for: ${key}`);
		}

		element.innerText = i18n(key, locale);
	});
}

function i18n(key: string, locale: string): string {
	if (!cachedStrings) throw new Error("i18n strings not loaded");
	return i18nLookup(cachedStrings, key, locale);
}
