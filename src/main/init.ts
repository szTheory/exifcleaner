import { app, type BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { preloadI18nStrings } from "../infrastructure";
import { setupI18nHandlers, setContainer, handleLanguageChange, setLanguageChangeCallback } from "./i18n";
import { setupMenus } from "./menu/menu";
import { setupExifHandlers } from "./exif_handlers";
import { setupFolderHandlers } from "./folder_handlers";
import { setLanguageChangeHandler, setLanguageSettingGetter } from "./menu/menu_view";
import { setDockLanguageChangeHandler, setDockLanguageSettingGetter } from "./menu/menu_dock";
import { setupSettingsHandlers } from "./settings_handlers";
import { setupThemeHandlers } from "./theme_handlers";
import { setupRevealHandlers } from "./reveal_handlers";
import { setupContextMenu } from "./window/context_menu";
import { setupDockEventHandlers } from "./lifecycle/dock";
import { setupApp } from "./lifecycle/app_setup";
import { createContainer, initContainer } from "./container";
import type { Container } from "./container";
import { hardenNavigation } from "./security/navigation";
import { installPermissionGate } from "./security/permissions";
import { registerAllowedSender, unregisterSender } from "./ipc/ipc_validation";

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

	setContainer(container);

	// Wire menu rebuild callback for language changes (breaks i18n.ts -> menu.ts cycle)
	setLanguageChangeCallback(() => setupMenus());

	// Wire language change handler for View menu and dock menu
	const languageChangeHandler = (code: string | null): void => {
		const previousLanguage = container.settings.get().language;
		container.settings.update({ language: code });
		handleLanguageChange(previousLanguage, code);
	};
	const languageSettingGetter = (): string | null =>
		container.settings.get().language;
	setLanguageChangeHandler(languageChangeHandler);
	setLanguageSettingGetter(languageSettingGetter);
	setDockLanguageChangeHandler(languageChangeHandler);
	setDockLanguageSettingGetter(languageSettingGetter);

	preloadI18nStrings();
	setupI18nHandlers();
	setupExifHandlers({ container });
	setupFolderHandlers({ container });
	setupSettingsHandlers({
		container,
		getWindow: () => browserWindow,
	});
	setupThemeHandlers({
		getWindow: () => browserWindow,
		settingsService: container.settings,
	});
	setupRevealHandlers();
	setupContextMenu();
	setupDockEventHandlers(browserWindow);
	setupUserModelId();
	setupApp(browserWindow, {
		onQuit: () => container.exiftoolProcess.close(),
	});

	return container;
}
