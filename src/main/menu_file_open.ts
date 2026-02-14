import {
	BaseWindow,
	BrowserWindow,
	MenuItemConstructorOptions,
	MenuItem,
	KeyboardEvent,
} from "electron";
import { i18n } from "./i18n";
import { fileOpen } from "./file_open";

export function fileMenuOpenItem(): MenuItemConstructorOptions {
	return {
		label: `${i18n("menu.file.open")}…`,
		accelerator: "CmdOrCtrl+O",
		click: fileOpenClick,
	};
}

function fileOpenClick(
	_menuItem: MenuItem,
	browserWindow: BaseWindow | undefined,
	_event: KeyboardEvent,
): void {
	fileOpen(browserWindow instanceof BrowserWindow ? browserWindow : undefined);
}
