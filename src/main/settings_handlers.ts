import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import type { Container } from "./container";
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";
import { validateSettings } from "../domain/settings_schema";

export function setupSettingsHandlers({
	container,
	getWindow,
}: {
	container: Container;
	getWindow: () => BrowserWindow | null;
}): void {
	ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
		return container.settings.get();
	});

	ipcMain.handle(
		IPC_CHANNELS.SETTINGS_SET,
		async (_event, input: unknown) => {
			const validationResult = validateSettings(input);
			if (!validationResult.ok) {
				return { success: false, error: validationResult.error };
			}

			await container.settings.update(validationResult.value);

			// Notify renderer of settings change
			const win = getWindow();
			if (win) {
				win.webContents.send(
					IPC_CHANNELS.SETTINGS_CHANGED,
					container.settings.get(),
				);
			}

			return { success: true, error: null };
		},
	);
}
