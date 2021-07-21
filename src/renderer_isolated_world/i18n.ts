import { ipcRenderer } from "electron";
import { preloadI18nStrings, i18n } from "../common/i18n.js";
import { IPC_EVENT_NAME_GET_LOCALE } from "../main/i18n.js";

const ATTRIBUTE_I18N = "i18n";

export function setupI18n(): void {
	preloadI18nStrings();
	translateHtml();
}

async function translateHtml(): Promise<void> {
	console.log("translateHtml");
	const locale = await getLocale();
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

async function getLocale() {
	return await ipcRenderer.invoke(IPC_EVENT_NAME_GET_LOCALE);
}
