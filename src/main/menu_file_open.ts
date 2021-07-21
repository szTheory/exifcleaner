import {
	BrowserWindow,
	MenuItemConstructorOptions,
	MenuItem,
	KeyboardEvent,
} from "electron";
import { i18n } from "./i18n.js";
import { fileOpen } from "./file_open.js";

export function fileMenuOpenItem(): MenuItemConstructorOptions {
	return {
		label: `${i18n("menu.file.open")}…`,
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick,
	};
}

function fileOpenClick(
	_menuItem: MenuItem,
	browserWindow: BrowserWindow | undefined,
	_event: KeyboardEvent
): void {
	fileOpen(browserWindow);
}
