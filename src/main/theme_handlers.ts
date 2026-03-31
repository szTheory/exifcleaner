import { ipcMain, nativeTheme, systemPreferences } from "electron";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../common";
import { createValidatedHandler } from "./ipc/ipc_validation";
import {
	themeGetSchema,
	themeSetSchema,
	themeAccentColorSchema,
} from "./ipc/ipc_schemas";
import { parseAccentColorHex, ACCENT_COLOR_FALLBACK } from "../domain";
import type { SettingsService } from "../infrastructure";

function getAccentColorHex(): string {
	if (process.platform === "darwin" || process.platform === "win32") {
		const raw = systemPreferences.getAccentColor();
		return parseAccentColorHex(raw);
	}
	return ACCENT_COLOR_FALLBACK;
}

export function setupThemeHandlers({
	getWindow,
	settingsService,
}: {
	getWindow: () => BrowserWindow | null;
	settingsService?: SettingsService;
}): void {
	ipcMain.handle(
		IPC_CHANNELS.THEME_GET,
		createValidatedHandler(themeGetSchema, async () => {
			return { shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.THEME_SET,
		createValidatedHandler(themeSetSchema, async (mode) => {
			nativeTheme.themeSource = mode;
			if (settingsService) {
				await settingsService.update({ themeMode: mode });
			}
			return { success: true };
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.THEME_ACCENT_COLOR,
		createValidatedHandler(themeAccentColorSchema, async () => {
			return { color: getAccentColorHex() };
		}),
	);

	nativeTheme.on("updated", () => {
		const win = getWindow();
		if (win) {
			win.webContents.send(IPC_CHANNELS.THEME_CHANGED, {
				shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
			});
			// Re-read accent color on macOS (accent-color-changed event does not fire on macOS)
			if (process.platform === "darwin") {
				win.webContents.send(IPC_CHANNELS.THEME_ACCENT_COLOR_CHANGED, {
					color: getAccentColorHex(),
				});
			}
		}
	});

	// Accent color changes (Windows/Linux; macOS reads on nativeTheme.updated above)
	if (process.platform === "win32" || process.platform === "linux") {
		systemPreferences.on(
			"accent-color-changed" as "accent-color-changed",
			() => {
				const win = getWindow();
				if (win) {
					win.webContents.send(IPC_CHANNELS.THEME_ACCENT_COLOR_CHANGED, {
						color: getAccentColorHex(),
					});
				}
			},
		);
	}
}
