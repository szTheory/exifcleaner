import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ElectronApi } from "./api_types";
import type { IpcInvokeMap } from "../common/ipc_channels";
import type { Settings } from "../domain";

// Type-safe invoke wrapper: enforces arg/return types per channel
type TypedInvoke = <K extends keyof IpcInvokeMap>(
	channel: K,
	...args: IpcInvokeMap[K]["args"]
) => Promise<IpcInvokeMap[K]["return"]>;

const typedInvoke: TypedInvoke = (channel, ...args) =>
	ipcRenderer.invoke(channel, ...args);

function basename(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || filePath;
}

// Helper to safely access a property on an unknown object after narrowing
function hasOwnProperty<K extends string>(
	obj: object,
	key: K,
): obj is Record<K, unknown> {
	return key in obj;
}

// Runtime type guards for IPC event payloads (trusted from main process)
function isThemeChangedPayload(
	value: unknown,
): value is { shouldUseDarkColors: boolean } {
	return (
		typeof value === "object" &&
		value !== null &&
		hasOwnProperty(value, "shouldUseDarkColors") &&
		typeof value["shouldUseDarkColors"] === "boolean"
	);
}

function isAccentColorPayload(
	value: unknown,
): value is { color: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		hasOwnProperty(value, "color") &&
		typeof value["color"] === "string"
	);
}

const VALID_THEME_MODES = new Set(["light", "dark", "system"]);

function isThemeMode(value: unknown): value is "light" | "dark" | "system" {
	return typeof value === "string" && VALID_THEME_MODES.has(value);
}

function isSettings(value: unknown): value is Settings {
	return typeof value === "object" && value !== null && "themeMode" in value;
}

const api: ElectronApi = {
	exif: {
		readMetadata: (filePath: string) => typedInvoke("exif:read", filePath),
		removeMetadata: (filePath: string) =>
			typedInvoke("exif:remove", filePath),
	},

	i18n: {
		getLocale: () => typedInvoke("get-locale"),
		getStrings: () => typedInvoke("get-i18n-strings"),
		onLanguageChanged: (callback: (locale: string) => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				newLocale: unknown,
			) => {
				if (typeof newLocale === "string") {
					callback(newLocale);
				}
			};
			ipcRenderer.on("language:changed", handler);
			return () => ipcRenderer.removeListener("language:changed", handler);
		},
	},

	files: {
		basename,
		getPathForFile: (file: File) => webUtils.getPathForFile(file),
		notifyFilesAdded: (count: number) =>
			ipcRenderer.send("files-added", count),
		notifyFileProcessed: () => ipcRenderer.send("file-processed"),
		notifyAllFilesProcessed: () => ipcRenderer.send("all-files-processed"),
		onFileOpenAddFiles: (callback: (filePaths: string[]) => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				filePaths: string[],
			) => callback(filePaths);
			ipcRenderer.on("file-open-add-files", handler);
			return () => ipcRenderer.removeListener("file-open-add-files", handler);
		},
	},

	theme: {
		get: () => typedInvoke("theme:get"),
		set: (mode: "light" | "dark" | "system") =>
			typedInvoke("theme:set", mode),
		getAccentColor: () => typedInvoke("theme:accent-color"),
		onChanged: (
			callback: (payload: { shouldUseDarkColors: boolean }) => void,
		) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				payload: unknown,
			) => {
				if (isThemeChangedPayload(payload)) {
					callback(payload);
				}
			};
			ipcRenderer.on("theme:changed", handler);
			return () => ipcRenderer.removeListener("theme:changed", handler);
		},
		onAccentColorChanged: (
			callback: (payload: { color: string }) => void,
		) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				payload: unknown,
			) => {
				if (isAccentColorPayload(payload)) {
					callback(payload);
				}
			};
			ipcRenderer.on("theme:accent-color-changed", handler);
			return () =>
				ipcRenderer.removeListener("theme:accent-color-changed", handler);
		},
		onThemeModeChanged: (
			callback: (mode: "light" | "dark" | "system") => void,
		) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				mode: unknown,
			) => {
				if (isThemeMode(mode)) {
					callback(mode);
				}
			};
			ipcRenderer.on("theme:mode-changed-from-menu", handler);
			return () =>
				ipcRenderer.removeListener("theme:mode-changed-from-menu", handler);
		},
	},

	settings: {
		get: () => typedInvoke("settings:get"),
		set: (settings) => typedInvoke("settings:set", settings),
		onChanged: (callback) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				settings: unknown,
			) => {
				if (isSettings(settings)) {
					callback(settings);
				}
			};
			ipcRenderer.on("settings:changed", handler);
			return () => ipcRenderer.removeListener("settings:changed", handler);
		},
		onToggle: (callback: () => void) => {
			const handler = () => callback();
			ipcRenderer.on("settings:toggle", handler);
			return () => ipcRenderer.removeListener("settings:toggle", handler);
		},
	},

	reveal: {
		showInFolder: (filePath: string) =>
			typedInvoke("file:reveal", filePath),
		showContextMenu: (paths: { cleanedPath: string; originalPath: string }) =>
			typedInvoke("file:reveal-context-menu", paths),
	},

	folder: {
		classify: (paths: string[]) => typedInvoke("folder:classify", paths),
		expand: (dirPath: string) => typedInvoke("folder:expand", dirPath),
	},

	platform: {
		isMac: process.platform === "darwin",
	},
};

contextBridge.exposeInMainWorld("api", api);
