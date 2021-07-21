import { MenuItemConstructorOptions } from "electron";
import { fileMenuOpenItem } from "./menu_file_open.js";

export function dockMenuTemplate(): MenuItemConstructorOptions[] {
	return [fileMenuOpenItem()];
}
