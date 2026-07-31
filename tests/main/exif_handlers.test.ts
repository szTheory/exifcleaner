import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { Container } from "../../src/main/container";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import {
	registerAllowedSender,
	unregisterSender,
} from "../../src/main/ipc/ipc_validation";
import { setupExifHandlers } from "../../src/main/exif_handlers";

const ipcHandleMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
	ipcMain: {
		handle: ipcHandleMock,
	},
}));

vi.mock("node:fs", () => ({
	existsSync: existsSyncMock,
}));

const TEST_SENDER_ID = 304;

function captureInvokeHandler(channel: string): {
	handler: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>;
} {
	const call = ipcHandleMock.mock.calls.find(([registeredChannel]) => {
		return registeredChannel === channel;
	});
	if (!call) {
		throw new Error(`No handler registered for ${channel}`);
	}
	const [, handler] = call as [
		string,
		(event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>,
	];
	return { handler };
}

function makeContainer({
	saveAsCopy,
	executeResult = { ok: true, value: { tagsRemoved: 0 } },
}: {
	saveAsCopy: boolean;
	executeResult?: Awaited<ReturnType<Container["stripMetadata"]["execute"]>>;
}): {
	container: Container;
	stripMetadata: { execute: ReturnType<typeof vi.fn> };
} {
	const stripMetadata = {
		execute: vi.fn(async () => executeResult),
	};
	const container = {
		settings: {
			get: () => ({
				...DEFAULT_SETTINGS,
				saveAsCopy,
			}),
		},
		readMetadata: {
			execute: vi.fn(),
		},
		stripMetadata,
	} as unknown as Container;
	return { container, stripMetadata };
}

function makeAuthorizedEvent(): IpcMainInvokeEvent {
	registerAllowedSender(TEST_SENDER_ID);
	return { sender: { id: TEST_SENDER_ID } } as IpcMainInvokeEvent;
}

beforeEach(() => {
	ipcHandleMock.mockClear();
	existsSyncMock.mockReset();
	existsSyncMock.mockReturnValue(false);
});

afterEach(() => {
	unregisterSender(TEST_SENDER_ID);
});

describe("exif:remove handler", () => {
	it("returns and writes generated copy path when save-as-copy has no collision", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledWith({
			filePath: "/dir/photo.jpg",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: false,
			saveAsCopy: true,
			outputPath: "/dir/photo_cleaned.jpg",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.jpg",
			wasForcedCopy: false,
		});
	});

	it("forces a collision-safe copy for RAW when save-as-copy is disabled", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: false });
		existsSyncMock.mockImplementation((candidate: string) => {
			return candidate === "/tmp/sample_cleaned.raf";
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/tmp/sample.raf");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/tmp/sample.raf",
				saveAsCopy: true,
				outputPath: "/tmp/sample_cleaned_2.raf",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/tmp/sample_cleaned_2.raf",
			wasForcedCopy: true,
		});
	});

	it("passes and returns an absolute root copy path", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/photo.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/photo.jpg",
				outputPath: "/photo_cleaned.jpg",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/photo_cleaned.jpg",
			wasForcedCopy: false,
		});
	});

	it("returns and writes collision suffix without mutating the request path", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		existsSyncMock.mockImplementation((candidate: string) => {
			return candidate === "/dir/photo_cleaned.jpg";
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/photo.jpg",
				saveAsCopy: true,
				outputPath: "/dir/photo_cleaned_2.jpg",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned_2.jpg",
			wasForcedCopy: false,
		});
	});

	it("returns and writes the source path when overwrite mode is active", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: false });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
				expect.objectContaining({
				filePath: "/dir/photo.jpg",
				saveAsCopy: false,
				outputPath: undefined,
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo.jpg",
			wasForcedCopy: false,
		});
	});

	it("returns explicit error without a success output path when stripping fails", async () => {
		const { container, stripMetadata } = makeContainer({
			saveAsCopy: true,
			executeResult: {
				ok: false,
				error: { code: "exiftool-error", detail: "Permission denied" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			error: "ExifTool error: Permission denied",
		});
		expect(result).not.toHaveProperty("outputPath");
	});

	it("rejects an empty string before executing the command", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");

		await expect(handler(makeAuthorizedEvent(), "")).rejects.toThrow();
		expect(stripMetadata.execute).not.toHaveBeenCalled();
	});

	it("rejects null before executing the command", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");

		await expect(handler(makeAuthorizedEvent(), null)).rejects.toThrow();
		expect(stripMetadata.execute).not.toHaveBeenCalled();
	});
});
