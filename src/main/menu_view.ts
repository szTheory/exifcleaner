import type { MenuItemConstructorOptions } from "electron";
import { nativeTheme, BrowserWindow } from "electron";
import { i18n } from "./i18n";
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";

function broadcastThemeSet(mode: "light" | "dark" | "system"): void {
	const win = BrowserWindow.getAllWindows()[0];
	if (win) {
		win.webContents.send(IPC_CHANNELS.THEME_MODE_CHANGED_FROM_MENU, mode);
	}
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
