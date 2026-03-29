import { app, type BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { preloadI18nStrings } from "../infrastructure/electron/i18n_strings";
import { setupI18nHandlers } from "./i18n";
import { setupExifHandlers } from "./exif_handlers";
import { setupSettingsHandlers } from "./settings_handlers";
import { setupThemeHandlers } from "./theme_handlers";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";
import { setupApp } from "./app_setup";
import { createContainer, initContainer } from "./container";
import type { Container } from "./container";
import { hardenNavigation } from "./security/navigation";
import { installPermissionGate } from "./security/permissions";
import {
	registerAllowedSender,
	unregisterSender,
} from "./ipc/ipc_validation";

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export async function init(
	browserWindow: BrowserWindow | null,
): Promise<Container> {
	const container = createContainer();
	await initContainer(container);

	// Install security hardening before any IPC handlers fire
	installPermissionGate();
	if (browserWindow) {
		registerAllowedSender(browserWindow.webContents.id);
		browserWindow.webContents.on("destroyed", () => {
			unregisterSender(browserWindow.webContents.id);
		});
		hardenNavigation(browserWindow);
	}

	preloadI18nStrings();
	setupI18nHandlers();
	setupExifHandlers({ container });
	setupSettingsHandlers({
		container,
		getWindow: () => browserWindow,
	});
	setupThemeHandlers({
		getWindow: () => browserWindow,
	});
	setupContextMenu();
	setupDockEventHandlers(browserWindow);
	setupUserModelId();
	setupApp(browserWindow, {
		onQuit: () => container.exiftoolProcess.close(),
	});

	return container;
}
