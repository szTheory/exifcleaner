import { app, Menu, MenuItem, BrowserWindow } from "electron";
import { i18n } from "./i18n";

function menu(canCopy: boolean): Menu {
	const menu = new Menu();

	if (canCopy) {
		menu.append(
			new MenuItem({
				label: i18n("contextmenu.copy"),
				role: "copy",
				visible: canCopy,
				enabled: canCopy,
			})
		);
	}
	menu.append(
		new MenuItem({ label: i18n("contextmenu.select-all"), role: "selectAll" })
	);
	return menu;
}

export function setupContextMenu(): void {
	app.on(
		"browser-window-created",
		(event: Event, browserWindow: BrowserWindow) => {
			browserWindow.webContents.on(
				"context-menu",
				(_event: Event, params: Electron.ContextMenuParams) => {
					const isTextSelected = params.selectionText.trim().length > 0;
					menu(params.editFlags.canCopy && isTextSelected).popup();
				}
			);
		}
	);
}
