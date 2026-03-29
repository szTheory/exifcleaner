import type { I18nStringsDictionary } from "../domain/i18n_lookup";
import type { Settings } from "../domain/settings_schema";

export type { I18nStringsDictionary };

export interface ExifData {
	[key: string]: unknown;
}

export interface ExifApi {
	readMetadata: (filePath: string) => Promise<ExifData>;
	removeMetadata: (filePath: string) => Promise<object>;
}

export interface I18nApi {
	getLocale: () => Promise<string>;
	getStrings: () => Promise<I18nStringsDictionary>;
}

export interface FilesApi {
	basename: (filePath: string) => string;
	getPathForFile: (file: File) => string;
	notifyFilesAdded: (count: number) => void;
	notifyFileProcessed: () => void;
	notifyAllFilesProcessed: () => void;
	onFileOpenAddFiles: (callback: (filePaths: string[]) => void) => () => void;
}

export interface ThemeApi {
	get: () => Promise<{ shouldUseDarkColors: boolean }>;
	set: (mode: "light" | "dark" | "system") => Promise<{ success: boolean }>;
	getAccentColor: () => Promise<{ color: string }>;
	onChanged: (
		callback: (payload: { shouldUseDarkColors: boolean }) => void,
	) => () => void;
	onAccentColorChanged: (
		callback: (payload: { color: string }) => void,
	) => () => void;
	onThemeModeChanged?: (
		callback: (mode: "light" | "dark" | "system") => void,
	) => () => void;
}

export interface SettingsApi {
	get: () => Promise<Settings>;
	set: (
		settings: Partial<Settings>,
	) => Promise<{ success: boolean; error: string | null }>;
	onChanged: (callback: (settings: Settings) => void) => () => void;
	onToggle: (callback: () => void) => () => void;
}

export interface FolderApi {
	classify: (
		paths: string[],
	) => Promise<{ files: string[]; folders: string[] }>;
	expand: (
		dirPath: string,
	) => Promise<{ files: string[]; skippedCount: number; error?: string }>;
}

export interface PlatformApi {
	isMac: boolean;
}

export interface ElectronApi {
	exif: ExifApi;
	i18n: I18nApi;
	files: FilesApi;
	theme: ThemeApi;
	settings: SettingsApi;
	platform: PlatformApi;
	folder: FolderApi;
}
