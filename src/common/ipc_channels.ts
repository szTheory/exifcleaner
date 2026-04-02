import type { ExifToolResult } from "../infrastructure/exiftool/types";
import type { Settings, ThemeMode } from "../domain/settings_schema";
import type { I18nStringsDictionary } from "../domain/i18n/i18n_lookup";

export const IPC_CHANNELS = {
	// Existing channels (preserved for backward compatibility with current renderer)
	FILES_ADDED: "files-added",
	FILE_PROCESSED: "file-processed",
	ALL_FILES_PROCESSED: "all-files-processed",
	FILE_OPEN_ADD_FILES: "file-open-add-files",
	GET_LOCALE: "get-locale",
	GET_I18N_STRINGS: "get-i18n-strings",
	EXIF_READ: "exif:read",
	EXIF_REMOVE: "exif:remove",
	// New channels for Phase 2
	SETTINGS_GET: "settings:get",
	SETTINGS_SET: "settings:set",
	SETTINGS_CHANGED: "settings:changed",
	SETTINGS_TOGGLE: "settings:toggle",
	// Theme channels for Phase 3
	THEME_GET: "theme:get",
	THEME_CHANGED: "theme:changed",
	// Theme channels for Phase 6 (dark mode control)
	THEME_SET: "theme:set",
	THEME_ACCENT_COLOR: "theme:accent-color",
	THEME_ACCENT_COLOR_CHANGED: "theme:accent-color-changed",
	THEME_MODE_CHANGED_FROM_MENU: "theme:mode-changed-from-menu",
	// Language channels for Phase 7
	LANGUAGE_CHANGED: "language:changed",
	// Folder recursion channels for Phase 7
	FOLDER_CLASSIFY: "folder:classify",
	FOLDER_EXPAND: "folder:expand",
	// File reveal channels for Phase 7
	FILE_REVEAL: "file:reveal",
	FILE_REVEAL_CONTEXT_MENU: "file:reveal-context-menu",
} as const;

// Template literal types for channel name patterns
type ExifChannel = `exif:${string}`;
type SettingsChannel = `settings:${string}`;
type ThemeChannel = `theme:${string}`;

// Branded channel categories for documentation and future narrowing
export type { ExifChannel, SettingsChannel, ThemeChannel };

// Invoke channels (request-response via ipcRenderer.invoke / ipcMain.handle)
export interface IpcInvokeMap {
	[IPC_CHANNELS.EXIF_READ]: {
		args: [filePath: string];
		return: Record<string, unknown>;
	};
	[IPC_CHANNELS.EXIF_REMOVE]: {
		args: [filePath: string];
		return: { data: null; error: string | null };
	};
	[IPC_CHANNELS.SETTINGS_GET]: { args: []; return: Settings };
	[IPC_CHANNELS.SETTINGS_SET]: {
		args: [settings: Partial<Settings>];
		return: { success: boolean; error: string | null };
	};
	[IPC_CHANNELS.THEME_GET]: {
		args: [];
		return: { shouldUseDarkColors: boolean };
	};
	[IPC_CHANNELS.THEME_SET]: {
		args: [mode: ThemeMode];
		return: { success: boolean };
	};
	[IPC_CHANNELS.THEME_ACCENT_COLOR]: { args: []; return: { color: string } };
	[IPC_CHANNELS.GET_LOCALE]: { args: []; return: string };
	[IPC_CHANNELS.GET_I18N_STRINGS]: { args: []; return: I18nStringsDictionary };
	[IPC_CHANNELS.FOLDER_CLASSIFY]: {
		args: [paths: string[]];
		return: { files: string[]; folders: string[] };
	};
	[IPC_CHANNELS.FOLDER_EXPAND]: {
		args: [dirPath: string];
		return: { files: string[]; skippedCount: number; error?: string };
	};
	[IPC_CHANNELS.FILE_REVEAL]: {
		args: [filePath: string];
		return: { success: boolean; error?: string };
	};
	[IPC_CHANNELS.FILE_REVEAL_CONTEXT_MENU]: {
		args: [paths: { cleanedPath: string; originalPath: string }];
		return: { success: boolean };
	};
}

// Send channels (fire-and-forget via ipcRenderer.send / ipcMain.on)
export interface IpcSendMap {
	[IPC_CHANNELS.FILES_ADDED]: { args: [count: number] };
	[IPC_CHANNELS.FILE_PROCESSED]: { args: [] };
	[IPC_CHANNELS.ALL_FILES_PROCESSED]: { args: [] };
	[IPC_CHANNELS.FILE_OPEN_ADD_FILES]: { args: [filePaths: string[]] };
	[IPC_CHANNELS.SETTINGS_CHANGED]: { args: [settings: Settings] };
	[IPC_CHANNELS.SETTINGS_TOGGLE]: { args: [] };
	[IPC_CHANNELS.THEME_CHANGED]: {
		args: [payload: { shouldUseDarkColors: boolean }];
	};
	[IPC_CHANNELS.THEME_ACCENT_COLOR_CHANGED]: {
		args: [payload: { color: string }];
	};
	[IPC_CHANNELS.THEME_MODE_CHANGED_FROM_MENU]: { args: [mode: ThemeMode] };
	[IPC_CHANNELS.LANGUAGE_CHANGED]: { args: [locale: string] };
}
