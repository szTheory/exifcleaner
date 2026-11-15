import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Which URLs count as "the app itself". Shared by navigation hardening and IPC sender
 * validation so both agree: a document that is not the bundled renderer entry (for example
 * an HTML file dropped onto the window) must never be navigated to, and must never be able
 * to call the privileged `window.api` surface even if it does load.
 */
export interface AppUrlPolicy {
	/** `app.isPackaged`. The dev-server origin is only ever trusted when this is false. */
	readonly isPackaged: boolean;
	/** `file://` URL of the bundled renderer `index.html`. */
	readonly rendererEntryUrl: string;
	/** `ELECTRON_RENDERER_URL` from electron-vite dev, if any. Ignored when packaged. */
	readonly devServerUrl?: string | undefined;
}

/** Absolute path of the bundled renderer entry, relative to the main bundle (out/main). */
export function rendererEntryPath(): string {
	return path.join(__dirname, "../renderer/index.html");
}

export function rendererEntryUrl(): string {
	return pathToFileURL(rendererEntryPath()).href;
}

function withoutQueryAndHash(url: URL): string {
	return `${url.protocol}//${url.host}${url.pathname}`;
}

export function isAppUrl(url: string, policy: AppUrlPolicy): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	if (parsed.protocol === "file:") {
		let entry: URL;
		try {
			entry = new URL(policy.rendererEntryUrl);
		} catch {
			return false;
		}
		return withoutQueryAndHash(parsed) === withoutQueryAndHash(entry);
	}

	if (!policy.isPackaged && policy.devServerUrl !== undefined) {
		try {
			return parsed.origin === new URL(policy.devServerUrl).origin;
		} catch {
			return false;
		}
	}

	return false;
}
