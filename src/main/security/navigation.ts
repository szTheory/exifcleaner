import { shell } from "electron";
import type { BrowserWindow } from "electron";

// Accepts an optional openExternal function for testability.
// In production, defaults to shell.openExternal.
export function hardenNavigation(
	win: BrowserWindow,
	openExternal?: (url: string) => void,
): void {
	const openUrl = openExternal ?? ((url: string) => shell.openExternal(url));

	win.webContents.on("will-navigate", (event, url) => {
		const isDevAllowed =
			process.env.NODE_ENV !== "production" &&
			url.startsWith("http://localhost:");
		const isProdAllowed = url.startsWith("file://");
		if (!isDevAllowed && !isProdAllowed) {
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
