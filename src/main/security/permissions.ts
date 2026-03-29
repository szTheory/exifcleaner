import { session } from "electron";

// Accepts an optional session-like object for testability.
// In production, defaults to session.defaultSession.
export function installPermissionGate(targetSession?: {
	setPermissionRequestHandler: (
		handler: (
			webContents: unknown,
			permission: string,
			callback: (granted: boolean) => void,
		) => void,
	) => void;
}): void {
	const sess = targetSession ?? session.defaultSession;
	sess.setPermissionRequestHandler((_webContents, permission, callback) => {
		if (permission === "clipboard-sanitized-write") {
			callback(true);
			return;
		}
		console.warn(`[security] Denied permission: ${permission}`);
		callback(false);
	});
}
