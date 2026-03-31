import { app, ipcMain, BrowserWindow } from "electron";
import {
	i18n as i18nCommon,
	getI18nStrings,
} from "../infrastructure/electron/i18n_strings";
import { IPC_EVENT_NAME_GET_LOCALE } from "../domain/ipc_channels";
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { getLocaleSchema, getI18nStringsSchema } from "./ipc/ipc_schemas";
import type { Container } from "./container";
import { setupMenus } from "./menu";

export { IPC_EVENT_NAME_GET_LOCALE };

let containerRef: Container | null = null;

export function setContainer(container: Container): void {
	containerRef = container;
}

export function i18n(key: string): string {
	return i18nCommon(key, locale());
}

export function locale(): string {
	if (containerRef !== null) {
		const settings = containerRef.settings.get();
		if (settings.language !== null) {
			return settings.language;
		}
	}
	return app.getLocale();
}

export function rebuildMenusForLanguageChange(): void {
	setupMenus();
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

// Called when settings change to detect language changes and rebuild menus
export function handleLanguageChange(
	previousLanguage: string | null,
	newLanguage: string | null,
): void {
	if (previousLanguage === newLanguage) return;

	rebuildMenusForLanguageChange();

	// Broadcast language change to renderer
	const win = BrowserWindow.getAllWindows()[0];
	if (win) {
		win.webContents.send(IPC_CHANNELS.LANGUAGE_CHANGED, locale());
	}
}
