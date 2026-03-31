import { app, ipcMain, BrowserWindow } from "electron";
import { i18n as i18nCommon, getI18nStrings } from "../infrastructure";
import { IPC_CHANNELS } from "../common";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { getLocaleSchema, getI18nStringsSchema } from "./ipc/ipc_schemas";
import type { Container } from "./container";

let containerRef: Container | null = null;
let onLanguageChangeCallback: (() => void) | null = null;

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

export function setLanguageChangeCallback(callback: () => void): void {
	onLanguageChangeCallback = callback;
}

export function rebuildMenusForLanguageChange(): void {
	onLanguageChangeCallback?.();
}

export function setupI18nHandlers(): void {
	ipcMain.handle(
		IPC_CHANNELS.GET_LOCALE,
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
export function handleLanguageChange(previousLanguage: string | null, newLanguage: string | null): void {
	if (previousLanguage === newLanguage) return;

	rebuildMenusForLanguageChange();

	// Broadcast language change to renderer
	const win = BrowserWindow.getAllWindows()[0];
	if (win) {
		win.webContents.send(IPC_CHANNELS.LANGUAGE_CHANGED, locale());
	}
}
