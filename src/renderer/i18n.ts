import electron from "electron";
import { preloadI18nStrings, i18n } from "../common/i18n";

const ATTRIBUTE_I18N = "i18n";

export function setupI18n(): void {
	preloadI18nStrings();
	const locale = electron.remote.app.getLocale();

	translateHtml(locale);
}

function translateHtml(locale: string) {
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
