import { shell } from "electron";
import type { BrowserWindow } from "electron";
import { isAppUrl, type AppUrlPolicy } from "./app_url";

// Prevents the renderer from navigating anywhere other than the bundled app entry (or the
// electron-vite dev server in unpackaged builds). This matters beyond phishing: the preload
// script runs in whatever document the window shows, so a file:// HTML document reached by
// navigation (e.g. a file dropped outside the drop zone) would otherwise get `window.api`.
//
// Accepts an optional openExternal function for testability.
// In production, defaults to shell.openExternal.
export function hardenNavigation(
	win: BrowserWindow,
	policy: AppUrlPolicy,
	openExternal?: (url: string) => void,
): void {
	const openUrl = openExternal ?? ((url: string) => shell.openExternal(url));

	win.webContents.on("will-navigate", (event, url) => {
		if (!isAppUrl(url, policy)) {
			console.warn(`[security] Blocked navigation to: ${url}`);
			event.preventDefault();
		}
	});

	win.webContents.setWindowOpenHandler(({ url }) => {
		try {
			const parsed = new URL(url);
			if (parsed.protocol === "https:") {
				openUrl(url);
			}
		} catch {
			// Invalid URL, ignore
		}
		return { action: "deny" };
	});
}
