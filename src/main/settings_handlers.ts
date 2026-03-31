import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import type { Container } from "./container";
import { IPC_CHANNELS } from "../common";
import { validateSettings } from "../domain";
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
			const validationResult = validateSettings(input);
			if (!validationResult.ok) {
				return { success: false, error: validationResult.error };
			}

			// Capture previous language before updating
			const previousLanguage = container.settings.get().language;

			await container.settings.update(validationResult.value);

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
