import { shell, type MenuItemConstructorOptions } from "electron";

interface OpenUrlMenuItemParams {
	label: string;
	url: string;
}

export function openUrlMenuItem({
	label,
	url,
}: OpenUrlMenuItemParams): MenuItemConstructorOptions {
	return {
		label: label,
		click: function () {
			shell.openExternal(url);
		},
	};
}
