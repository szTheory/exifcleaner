import { ipcMain, nativeTheme } from "electron";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { themeGetSchema } from "./ipc/ipc_schemas";

export function setupThemeHandlers({
	getWindow,
}: {
	getWindow: () => BrowserWindow | null;
}): void {
	ipcMain.handle(
		IPC_CHANNELS.THEME_GET,
		createValidatedHandler(themeGetSchema, async () => {
			return { shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
		}),
	);

	nativeTheme.on("updated", () => {
		const win = getWindow();
		if (win) {
			win.webContents.send(IPC_CHANNELS.THEME_CHANGED, {
				shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
			});
		}
	});
}
