import { app, ipcMain } from "electron";
import { i18n as i18nCommon, getI18nStrings } from "../common/i18n";

import { IPC_EVENT_NAME_GET_LOCALE } from "../common/ipc_events";
export { IPC_EVENT_NAME_GET_LOCALE };

export function i18n(key: string): string {
	return i18nCommon(key, locale());
}

export function setupI18nHandlers() {
	ipcMain.handle(IPC_EVENT_NAME_GET_LOCALE, async () => {
		return locale();
	});

	ipcMain.handle("get-i18n-strings", async () => {
		return getI18nStrings();
	});
}

function locale() {
	return app.getLocale();
}
