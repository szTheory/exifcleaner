import type { MenuItemConstructorOptions } from "electron";
import { nativeTheme, BrowserWindow } from "electron";
import { i18n } from "../i18n";
import { IPC_CHANNELS } from "../../common";
import { LANGUAGE_NAMES } from "../../domain";

function broadcastThemeSet(mode: "light" | "dark" | "system"): void {
	const win = BrowserWindow.getAllWindows()[0];
	if (win) {
		win.webContents.send(IPC_CHANNELS.THEME_MODE_CHANGED_FROM_MENU, mode);
	}
}

// Set by init.ts to avoid circular dependency with container
let onLanguageChange: ((code: string | null) => void) | null = null;
let getLanguageSetting: (() => string | null) | null = null;

export function setLanguageChangeHandler(
	handler: (code: string | null) => void,
): void {
	onLanguageChange = handler;
}

export function setLanguageSettingGetter(
	getter: () => string | null,
): void {
	getLanguageSetting = getter;
}

function languageSubmenu(): MenuItemConstructorOptions {
	// Get the raw setting (null = System, string = explicit language)
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

export function viewMenuTemplate(): MenuItemConstructorOptions {
	return {
		label: i18n("menu.view.name"),
		submenu: [
			{
				label: i18n("appearance") || "Appearance",
				submenu: [
					{
						label: i18n("themeLight") || "Light",
						type: "radio",
						checked: nativeTheme.themeSource === "light",
						click: () => {
							nativeTheme.themeSource = "light";
							broadcastThemeSet("light");
						},
					},
					{
						label: i18n("themeAuto") || "Auto",
						type: "radio",
						checked: nativeTheme.themeSource === "system",
						click: () => {
							nativeTheme.themeSource = "system";
							broadcastThemeSet("system");
						},
					},
					{
						label: i18n("themeDark") || "Dark",
						type: "radio",
						checked: nativeTheme.themeSource === "dark",
						click: () => {
							nativeTheme.themeSource = "dark";
							broadcastThemeSet("dark");
						},
					},
				],
			},
			languageSubmenu(),
			{ type: "separator" },
			{
				label: i18n("menu.view.toggle-dev-tools"),
				role: "toggleDevTools",
			},
			{ type: "separator" },
			{
				label: i18n("menu.view.zoom-reset"),
				role: "resetZoom",
			},
			{
				label: i18n("menu.view.zoom-in"),
				role: "zoomIn",
			},
			{
				label: i18n("menu.view.zoom-out"),
				role: "zoomOut",
			},
			{ type: "separator" },
			{
				label: i18n("menu.view.toggle-full-screen"),
				role: "togglefullscreen",
			},
		],
	};
}
