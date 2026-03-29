import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import type { ZodType } from "zod";

const allowedSenders = new Set<number>();

export function registerAllowedSender(webContentsId: number): void {
	allowedSenders.add(webContentsId);
}

export function unregisterSender(webContentsId: number): void {
	allowedSenders.delete(webContentsId);
}

export function validateSender(event: { sender: { id: number } }): boolean {
	return allowedSenders.has(event.sender.id);
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
