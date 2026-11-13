import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import type { ZodType } from "zod";

const allowedSenders = new Set<number>();

export function registerAllowedSender(webContentsId: number): void {
	allowedSenders.add(webContentsId);
}

export function unregisterSender(webContentsId: number): void {
	allowedSenders.delete(webContentsId);
}

// Checks the URL of the document that sent the message, not just which window it came from.
// The preload script runs in whatever document a window shows, so a window ID alone cannot
// tell the bundled app apart from some other document that was loaded into the same window.
let isTrustedSenderUrl: ((url: string) => boolean) | null = null;

export function setTrustedSenderUrlPolicy(
	predicate: ((url: string) => boolean) | null,
): void {
	isTrustedSenderUrl = predicate;
}

export function validateSender(event: {
	sender: { id: number };
	senderFrame?: { url: string } | null;
}): boolean {
	if (!allowedSenders.has(event.sender.id)) {
		return false;
	}
	if (isTrustedSenderUrl === null) {
		return true;
	}
	const frame = event.senderFrame;
	return frame !== undefined && frame !== null && isTrustedSenderUrl(frame.url);
}

export function createValidatedHandler<TPayload, TResult>(
	schema: ZodType<TPayload>,
	handler: (payload: TPayload) => Promise<TResult>,
): (event: IpcMainInvokeEvent, payload: unknown) => Promise<TResult> {
	return async (event, rawPayload) => {
		if (!validateSender(event)) {
			throw new Error("Unauthorized IPC sender");
		}
		const parsed = schema.parse(rawPayload);
		return handler(parsed);
	};
}

export function createValidatedListener<TPayload>(
	schema: ZodType<TPayload>,
	handler: (payload: TPayload) => void,
): (event: IpcMainEvent, payload: unknown) => void {
	return (event, rawPayload) => {
		if (!validateSender(event)) {
			console.warn("[security] Rejected send from unauthorized sender");
			return;
		}
		const parsed = schema.safeParse(rawPayload);
		if (!parsed.success) {
			console.warn(
				`[security] Rejected malformed IPC payload: ${parsed.error.message}`,
			);
			return;
		}
		handler(parsed.data);
	};
}
