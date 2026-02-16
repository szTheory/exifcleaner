import { app, BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { ExiftoolProcess } from "../infrastructure/exiftool/ExiftoolProcess";
import { exiftoolBinPath } from "../infrastructure/electron/binaries";
import { preloadI18nStrings } from "../infrastructure/electron/i18n_strings";
import { setupI18nHandlers } from "./i18n";
import { setupExifHandlers } from "./exif_handlers";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";
import { setupApp } from "./app_setup";

// Composition root: owns singleton lifecycle, wires all dependencies.

let exifProcess: ExiftoolProcess | null = null;
let openPromise: Promise<number> | null = null;

async function getProcess(): Promise<ExiftoolProcess> {
	if (!exifProcess) {
		exifProcess = new ExiftoolProcess(exiftoolBinPath);
		openPromise = exifProcess.open();
	}
	await openPromise;
	return exifProcess!;
}

async function closeExifProcess(): Promise<void> {
	if (exifProcess) {
		await exifProcess.close();
		exifProcess = null;
		openPromise = null;
	}
}

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export function init(browserWindow: BrowserWindow | null): void {
	preloadI18nStrings();
	setupI18nHandlers();
	setupExifHandlers({ getProcess });
	setupContextMenu();
	setupDockEventHandlers(browserWindow);
	setupUserModelId();
	setupApp(browserWindow, { onQuit: () => closeExifProcess() });
}
