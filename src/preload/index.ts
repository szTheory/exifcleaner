import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ElectronApi} from "./api_types";

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
	},

	files: {
		basename,
		getPathForFile: (file: File) => webUtils.getPathForFile(file),
		notifyFilesAdded: (count: number) =>
			ipcRenderer.send("files-added", count),
		notifyFileProcessed: () => ipcRenderer.send("file-processed"),
		notifyAllFilesProcessed: () =>
			ipcRenderer.send("all-files-processed"),
		onFileOpenAddFiles: (callback: (filePaths: string[]) => void) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				filePaths: string[],
			) => callback(filePaths);
			ipcRenderer.on("file-open-add-files", handler);
			return () =>
				ipcRenderer.removeListener("file-open-add-files", handler);
		},
	},

	settings: {
		get: () => ipcRenderer.invoke("settings:get"),
		set: (settings) => ipcRenderer.invoke("settings:set", settings),
		onChanged: (callback) => {
			const handler = (
				_event: Electron.IpcRendererEvent,
				settings: unknown,
			) => callback(settings as import("../domain/settings_schema").Settings);
			ipcRenderer.on("settings:changed", handler);
			return () =>
				ipcRenderer.removeListener("settings:changed", handler);
		},
	},
};

contextBridge.exposeInMainWorld("api", api);
