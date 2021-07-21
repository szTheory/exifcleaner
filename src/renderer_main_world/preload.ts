// When contextIsolation is enabled in your webPreferences
// (this is the default behavior since Electron 12.0.0),
// your preload scripts run in an "Isolated World".
// source: https://www.electronjs.org/docs/api/context-bridge#exposing-node-global-symbols

import { contextBridge } from "electron";
import { processFiles } from "./process_files.js";

// console.log("preload");
console.log("preload");

declare global {
	interface Window {
		electron: {
			processFiles: (filePaths: string[]) => Promise<void>;
		};
	}
}

contextBridge.exposeInMainWorld("electron", {
	processFiles: processFiles,
});
