import { session } from "electron";

export function installPermissionGate(): void {
	session.defaultSession.setPermissionRequestHandler(
		(_webContents, permission, callback) => {
			console.warn(`[security] Denied permission: ${permission}`);
			callback(false);
		},
	);
}
