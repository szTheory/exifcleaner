import { app, ipcMain } from "electron";
import { i18n as i18nCommon } from "../common/i18n";

export const IPC_EVENT_NAME_GET_LOCALE = "get-locale";

export function i18n(key: string): string {
	return i18nCommon(key, locale());
}

export function setupI18nHandlers() {
	ipcMain.handle(IPC_EVENT_NAME_GET_LOCALE, async (_event, _path) => {
		return locale();
	});
}

function locale() {
	return app.getLocale();
}
