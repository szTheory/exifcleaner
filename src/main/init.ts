import { app, type BrowserWindow } from "electron";
import packageJson from "../../package.json";
import { preloadI18nStrings } from "../infrastructure";
import {
	setupI18nHandlers,
	setContainer,
	setLanguageChangeCallback,
} from "./i18n";
import { setupMenus } from "./menu/menu";
import { setupExifHandlers } from "./exif_handlers";
import { setupFolderHandlers } from "./folder_handlers";
import {
	setLanguageChangeHandler,
	setLanguageSettingGetter,
	setThemeChangeHandler,
	setThemeSettingGetter,
} from "./menu/menu_view";
import {
	setDockLanguageChangeHandler,
	setDockLanguageSettingGetter,
} from "./menu/menu_dock";
import {
	setupSettingsHandlers,
	updateSettingsAndNotify,
} from "./settings_handlers";
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

let activeBrowserWindow: BrowserWindow | null = null;
let processInitialization: Promise<Container> | null = null;

function getActiveBrowserWindow(): BrowserWindow | null {
	if (activeBrowserWindow?.isDestroyed()) {
		activeBrowserWindow = null;
	}
	return activeBrowserWindow;
}

/** Attach security and sender state that belongs to one window lifetime. */
export function attachWindow(browserWindow: BrowserWindow): void {
	activeBrowserWindow = browserWindow;
	registerAllowedSender(browserWindow.webContents.id);
	browserWindow.webContents.once("destroyed", () => {
		unregisterSender(browserWindow.webContents.id);
		if (activeBrowserWindow === browserWindow) {
			activeBrowserWindow = null;
		}
	});
	hardenNavigation(browserWindow);
}

async function initializeProcess(): Promise<Container> {
	const container = createContainer();
	await initContainer(container);

	// Install security hardening before any IPC handlers fire
	installPermissionGate();

	setContainer(container);

	// Wire menu rebuild callback for language changes (breaks i18n.ts -> menu.ts cycle)
	setLanguageChangeCallback(() => setupMenus());

	// Wire language change handler for View menu and dock menu
	const languageChangeHandler = async (code: string | null): Promise<void> => {
		await updateSettingsAndNotify({
			container,
			getWindow: getActiveBrowserWindow,
			partial: { language: code },
		});
	};
	const languageSettingGetter = (): string | null =>
		container.settings.get().language;
	setLanguageChangeHandler(languageChangeHandler);
	setLanguageSettingGetter(languageSettingGetter);
	setDockLanguageChangeHandler(languageChangeHandler);
	setDockLanguageSettingGetter(languageSettingGetter);

	// Wire theme change handler for View menu (same callback injection pattern as language)
	setThemeChangeHandler((mode) => {
		container.settings.update({ partial: { themeMode: mode } });
	});
	setThemeSettingGetter(() => container.settings.get().themeMode);

	preloadI18nStrings();
	setupI18nHandlers();
	setupExifHandlers({ container });
	setupFolderHandlers({ container, getWindow: getActiveBrowserWindow });
	setupSettingsHandlers({
		container,
		getWindow: getActiveBrowserWindow,
	});
	setupThemeHandlers({
		getWindow: getActiveBrowserWindow,
		settingsService: container.settings,
	});
	setupRevealHandlers();
	setupContextMenu();
	setupDockEventHandlers({ getWindow: getActiveBrowserWindow });
	setupUserModelId();
	setupApp({
		getWindow: getActiveBrowserWindow,
		onQuit: () => container.exiftoolProcess.close(),
	});

	return container;
}

/** Initialize process-wide services and handlers exactly once. */
export function initProcess(): Promise<Container> {
	if (processInitialization === null) {
		processInitialization = initializeProcess().catch((error: unknown) => {
			processInitialization = null;
			throw error;
		});
	}
	return processInitialization;
}
