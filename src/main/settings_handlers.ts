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
			// Capture previous language before updating
			const previousLanguage = container.settings.get().language;

			// settingsSetSchema has already validated this as a partial update. Expanding
			// it through full-schema defaults here would silently reset every omitted
			// preference whenever the user changed a single toggle.
			const partial = Object.fromEntries(
				Object.entries(input).filter(([, value]) => value !== undefined),
			) as Partial<Settings>;
			await container.settings.update({ partial });

			const newSettings = container.settings.get();

			// Notify renderer of settings change
			const win = getWindow();
			if (win) {
				win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, newSettings);
			}

			// Handle language change (rebuilds menus, notifies renderer)
			handleLanguageChange(previousLanguage, newSettings.language);

			return { success: true, error: null };
		}),
	);
}
