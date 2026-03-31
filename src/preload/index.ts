import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ElectronApi } from "./api_types";

function basename(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || filePath;
}

const api: ElectronApi = {
	exif: {
		readMetadata: (filePath: string) =>
			ipcRenderer.invoke("exif:read", filePath),
		removeMetadata: (filePath: string) =>
			ipcRenderer.invoke("exif:remove", filePath),
	},

	i18n: {
		getLocale: () => ipcRenderer.invoke("get-locale"),
		getStrings: () => ipcRenderer.invoke("get-i18n-strings"),
		onLanguageChanged: (callback: (locale: string) => void) => {
			const handler = (_event: Electron.IpcRendererEvent, newLocale: unknown) =>
				callback(newLocale as string);
			ipcRenderer.on("language:changed", handler);
			return () => ipcRenderer.removeListener("language:changed", handler);
		},
	},

	files: {
		basename,
		getPathForFile: (file: File) => webUtils.getPathForFile(file),
		notifyFilesAdded: (count: number) => ipcRenderer.send("files-added", count),
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
		get: () => ipcRenderer.invoke("theme:get"),
		set: (mode: "light" | "dark" | "system") =>
			ipcRenderer.invoke("theme:set", mode),
		getAccentColor: () => ipcRenderer.invoke("theme:accent-color"),
		onChanged: (
			callback: (payload: { shouldUseDarkColors: boolean }) => void,
		) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
				callback(payload as { shouldUseDarkColors: boolean });
			ipcRenderer.on("theme:changed", handler);
			return () => ipcRenderer.removeListener("theme:changed", handler);
		},
		onAccentColorChanged: (callback: (payload: { color: string }) => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
				callback(payload as { color: string });
			ipcRenderer.on("theme:accent-color-changed", handler);
			return () =>
				ipcRenderer.removeListener("theme:accent-color-changed", handler);
		},
		onThemeModeChanged: (
			callback: (mode: "light" | "dark" | "system") => void,
		) => {
			const handler = (_event: Electron.IpcRendererEvent, mode: unknown) =>
				callback(mode as "light" | "dark" | "system");
			ipcRenderer.on("theme:mode-changed-from-menu", handler);
			return () =>
				ipcRenderer.removeListener("theme:mode-changed-from-menu", handler);
		},
	},

	settings: {
		get: () => ipcRenderer.invoke("settings:get"),
		set: (settings) => ipcRenderer.invoke("settings:set", settings),
		onChanged: (callback) => {
			const handler = (_event: Electron.IpcRendererEvent, settings: unknown) =>
				callback(settings as import("../domain").Settings);
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
			ipcRenderer.invoke("file:reveal", filePath),
		showContextMenu: (paths: { cleanedPath: string; originalPath: string }) =>
			ipcRenderer.invoke("file:reveal-context-menu", paths),
	},

	folder: {
		classify: (paths: string[]) => ipcRenderer.invoke("folder:classify", paths),
		expand: (dirPath: string) => ipcRenderer.invoke("folder:expand", dirPath),
	},

	platform: {
		isMac: process.platform === "darwin",
	},
};

contextBridge.exposeInMainWorld("api", api);
