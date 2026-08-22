import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import type { Container } from "./container";
import type { Settings } from "../domain";
import { IPC_CHANNELS } from "../common";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { settingsGetSchema, settingsSetSchema } from "./ipc/ipc_schemas";
import { handleLanguageChange } from "./i18n";

export function setupSettingsHandlers({
	container,
	getWindow,
}: {
	container: Container;
	getWindow: () => BrowserWindow | null;
}): void {
	ipcMain.handle(
		IPC_CHANNELS.SETTINGS_GET,
		createValidatedHandler(settingsGetSchema, async () => {
			return container.settings.get();
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.SETTINGS_SET,
		createValidatedHandler(settingsSetSchema, async (input) => {
			// settingsSetSchema has already validated this as a partial update. Expanding
			// it through full-schema defaults here would silently reset every omitted
			// preference whenever the user changed a single toggle.
			const partial = Object.fromEntries(
				Object.entries(input).filter(([, value]) => value !== undefined),
			) as Partial<Settings>;
			await updateSettingsAndNotify({ container, getWindow, partial });

			return { success: true, error: null };
		}),
	);
}

export async function updateSettingsAndNotify({
	container,
	getWindow,
	partial,
}: {
	container: Container;
	getWindow: () => BrowserWindow | null;
	partial: Partial<Settings>;
}): Promise<Settings> {
	const previousLanguage = container.settings.get().language;
	await container.settings.update({ partial });
	const newSettings = container.settings.get();

	getWindow()?.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, newSettings);
	handleLanguageChange(previousLanguage, newSettings.language);

	return newSettings;
}
