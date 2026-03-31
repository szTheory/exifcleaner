import { type MenuItemConstructorOptions, BrowserWindow } from "electron";
import { fileMenuOpenItem } from "./menu_file_open";
import { i18n } from "./i18n";
import { IPC_CHANNELS } from "../common";
import { LANGUAGE_NAMES } from "../domain";

// Set by init.ts to avoid circular dependency with container
let onLanguageChange: ((code: string | null) => void) | null = null;
let getLanguageSetting: (() => string | null) | null = null;

export function setDockLanguageChangeHandler(
	handler: (code: string | null) => void,
): void {
	onLanguageChange = handler;
}

export function setDockLanguageSettingGetter(
	getter: () => string | null,
): void {
	getLanguageSetting = getter;
}

function dockLanguageSubmenu(): MenuItemConstructorOptions {
	const settingValue = getLanguageSetting?.() ?? null;

	const languageItems: MenuItemConstructorOptions[] = LANGUAGE_NAMES.map(
		(lang) => ({
			label: lang.nativeName,
			type: "radio" as const,
			checked: settingValue === lang.code,
			click: () => {
				onLanguageChange?.(lang.code);
			},
		}),
	);

	return {
		label: i18n("language") || "Language",
		submenu: [
			{
				label: `${i18n("languageSystem") || "System"}`,
				type: "radio" as const,
				checked: settingValue === null,
				click: () => {
					onLanguageChange?.(null);
				},
			},
			{ type: "separator" },
			...languageItems,
		],
	};
}

export function dockMenuTemplate(): MenuItemConstructorOptions[] {
	return [
		fileMenuOpenItem(),
		{
			label: `${i18n("menu.app.settings")}\u2026`,
			click: () => {
				const win = BrowserWindow.getAllWindows()[0];
				if (win) {
					win.show();
					win.webContents.send(IPC_CHANNELS.SETTINGS_TOGGLE);
				}
			},
		},
		dockLanguageSubmenu(),
	];
}
