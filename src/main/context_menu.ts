import { app, Menu, MenuItem, BrowserWindow } from "electron";

function menu(canCopy: boolean): Menu {
	const menu = new Menu();

	if (canCopy) {
		menu.append(
			new MenuItem({
				label: "Copy",
				role: "copy",
				visible: canCopy,
				enabled: canCopy,
			})
		);
	}
	menu.append(new MenuItem({ label: "Select All", role: "selectAll" }));
	return menu;
}

export function setupContextMenu(): void {
	app.on("browser-window-created", (event: Event, win: BrowserWindow) => {
		win.webContents.on(
			"context-menu",
			(_event: Event, params: Electron.ContextMenuParams) => {
				const isTextSelected = params.selectionText.trim().length > 0;
				menu(params.editFlags.canCopy && isTextSelected).popup();
			}
		);
	});
}
