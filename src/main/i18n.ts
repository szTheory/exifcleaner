import { app, ipcMain } from "electron";
import {
	i18n as i18nCommon,
	getI18nStrings,
} from "../infrastructure/electron/i18n_strings";
import { IPC_EVENT_NAME_GET_LOCALE } from "../domain/ipc_channels";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { getLocaleSchema, getI18nStringsSchema } from "./ipc/ipc_schemas";

export { IPC_EVENT_NAME_GET_LOCALE };

export function i18n(key: string): string {
	return i18nCommon(key, locale());
}

export function setupI18nHandlers(): void {
	ipcMain.handle(
		IPC_EVENT_NAME_GET_LOCALE,
		createValidatedHandler(getLocaleSchema, async () => {
			return locale();
		}),
	);

	ipcMain.handle(
		"get-i18n-strings",
		createValidatedHandler(getI18nStringsSchema, async () => {
			return getI18nStrings();
		}),
	);
}

function locale(): string {
	return app.getLocale();
}
