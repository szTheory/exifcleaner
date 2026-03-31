import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z, ZodError } from "zod";
import {
	validateSender,
	registerAllowedSender,
	unregisterSender,
	createValidatedHandler,
	createValidatedListener,
} from "../../../src/main/ipc/ipc_validation";
import { createFakeIpcEvent } from "../../fakes/electron_fakes";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";

const TEST_SENDER_ID = 42;

describe("sender validation", () => {
	afterEach(() => {
		unregisterSender(TEST_SENDER_ID);
	});

	it("returns false for unknown webContents ID", () => {
		const event = createFakeIpcEvent(999);
		expect(validateSender(event)).toBe(false);
	});

	it("returns true after registerAllowedSender", () => {
		registerAllowedSender(TEST_SENDER_ID);
		const event = createFakeIpcEvent(TEST_SENDER_ID);
		expect(validateSender(event)).toBe(true);
	});

	it("returns false after unregisterSender", () => {
		registerAllowedSender(TEST_SENDER_ID);
		unregisterSender(TEST_SENDER_ID);
		const event = createFakeIpcEvent(TEST_SENDER_ID);
		expect(validateSender(event)).toBe(false);
	});
});

describe("createValidatedHandler", () => {
	const schema = z.string().min(1);

	beforeEach(() => {
		registerAllowedSender(TEST_SENDER_ID);
	});

	afterEach(() => {
		unregisterSender(TEST_SENDER_ID);
	});

	it("rejects unauthorized sender with error", async () => {
		const handler = createValidatedHandler(schema, async (val) => val);
		const event = createFakeIpcEvent(999) as IpcMainInvokeEvent;

		await expect(handler(event, "test")).rejects.toThrow(
			"Unauthorized IPC sender",
		);
	});

	it("rejects malformed payload with ZodError", async () => {
		const handler = createValidatedHandler(schema, async (val) => val);
		const event = createFakeIpcEvent(TEST_SENDER_ID) as IpcMainInvokeEvent;

		await expect(handler(event, 123)).rejects.toThrow(ZodError);
	});

	it("calls handler with parsed payload for valid sender and payload", async () => {
		let receivedPayload: string | undefined;
		const handler = createValidatedHandler(schema, async (val) => {
			receivedPayload = val;
			return `processed: ${val}`;
		});
		const event = createFakeIpcEvent(TEST_SENDER_ID) as IpcMainInvokeEvent;

		const result = await handler(event, "hello");
		expect(result).toBe("processed: hello");
		expect(receivedPayload).toBe("hello");
	});
});

describe("createValidatedListener", () => {
	const schema = z.number().int().positive();

	beforeEach(() => {
		registerAllowedSender(TEST_SENDER_ID);
	});

	afterEach(() => {
		unregisterSender(TEST_SENDER_ID);
	});

	it("silently drops messages from unauthorized senders", () => {
		let called = false;
		const listener = createValidatedListener(schema, () => {
			called = true;
		});
		const event = createFakeIpcEvent(999) as IpcMainEvent;

		listener(event, 5);
		expect(called).toBe(false);
	});

	it("silently drops malformed payloads without throwing", () => {
		let called = false;
		const listener = createValidatedListener(schema, () => {
			called = true;
		});
		const event = createFakeIpcEvent(TEST_SENDER_ID) as IpcMainEvent;

		// Should not throw, just log warning and drop
		expect(() => listener(event, "not-a-number")).not.toThrow();
		expect(called).toBe(false);
	});

	it("calls handler with parsed payload for valid sender and payload", () => {
		let receivedPayload: number | undefined;
		const listener = createValidatedListener(schema, (val) => {
			receivedPayload = val;
		});
		const event = createFakeIpcEvent(TEST_SENDER_ID) as IpcMainEvent;

		listener(event, 42);
		expect(receivedPayload).toBe(42);
	});
});
