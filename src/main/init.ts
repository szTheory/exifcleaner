import { app, type BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { preloadI18nStrings } from "../infrastructure/electron/i18n_strings";
import { setupI18nHandlers } from "./i18n";
import { setupExifHandlers } from "./exif_handlers";
import { setupSettingsHandlers } from "./settings_handlers";
import { setupContextMenu } from "./context_menu";
import { setupDockEventHandlers } from "./dock";
import { setupApp } from "./app_setup";
import { createContainer, initContainer } from "./container";
import type { Container } from "./container";

function setupUserModelId(): void {
	app.setAppUserModelId(packageJson.build.appId);
}

export async function init(
	browserWindow: BrowserWindow | null,
): Promise<Container> {
	const container = createContainer();
	await initContainer(container);

	preloadI18nStrings();
	setupI18nHandlers();
	setupExifHandlers({ container });
	setupSettingsHandlers({
		container,
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
