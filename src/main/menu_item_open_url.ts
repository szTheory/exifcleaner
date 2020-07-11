import { shell, MenuItemConstructorOptions } from "electron";

export function openUrlMenuItem(
	label: string,
	url: string
): MenuItemConstructorOptions {
	return {
		label: label,
		click: function () {
			shell.openExternal(url);
		},
	};
}
