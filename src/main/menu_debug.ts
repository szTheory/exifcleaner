import { app, shell, MenuItemConstructorOptions } from "electron";
import { configStore } from "../common/config";

export function buildDebugSubmenu(): MenuItemConstructorOptions[] {
	return [
		{
			label: "Show Settings",
			click() {
				configStore.openInEditor();
			}
		},
		{
			label: "Show App Data",
			click() {
				shell.openItem(app.getPath("userData"));
			}
		},
		{
			type: "separator"
		},
		{
			label: "Delete Settings",
			click() {
				configStore.clear();
				app.relaunch();
				app.quit();
			}
		},
		{
			label: "Delete App Data",
			click() {
				shell.moveItemToTrash(app.getPath("userData"));
				app.relaunch();
				app.quit();
			}
		}
	];
}
