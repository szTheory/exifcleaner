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
const randomUUIDMock = vi.hoisted(() => vi.fn(() => "test-uuid"));

vi.mock("electron", () => ({
	ipcMain: {
		handle: ipcHandleMock,
	},
}));

vi.mock("node:fs", () => ({
	existsSync: existsSyncMock,
}));

vi.mock("node:crypto", () => ({
	randomUUID: randomUUIDMock,
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
	transactionResult = { ok: true, value: { outputPath: "/dir/video_cleaned.mp4" } },
}: {
	saveAsCopy: boolean;
	executeResult?: Awaited<ReturnType<Container["stripMetadata"]["execute"]>>;
	transactionResult?: Awaited<ReturnType<Container["outputTransaction"]["execute"]>>;
}): {
	container: Container;
	stripMetadata: { execute: ReturnType<typeof vi.fn> };
	outputTransaction: { execute: ReturnType<typeof vi.fn> };
} {
	const stripMetadata = {
		execute: vi.fn(async () => executeResult),
	};
	const outputTransaction = {
		execute: vi.fn(async () => transactionResult),
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
		outputTransaction,
	} as unknown as Container;
	return { container, stripMetadata, outputTransaction };
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

	it.each([
		["raf", "/tmp/sample_cleaned.raf"],
		["cr2", "/tmp/sample_cleaned.cr2"],
		["cr3", "/tmp/sample_cleaned.cr3"],
		["nef", "/tmp/sample_cleaned.nef"],
		["arw", "/tmp/sample_cleaned.arw"],
		["orf", "/tmp/sample_cleaned.orf"],
		["rw2", "/tmp/sample_cleaned.rw2"],
		["dng", "/tmp/sample_cleaned.dng"],
		["pef", "/tmp/sample_cleaned.pef"],
		["srw", "/tmp/sample_cleaned.srw"],
		["RAF", "/tmp/sample_cleaned.RAF"],
		["Cr3", "/tmp/sample_cleaned.Cr3"],
	])("returns the exact generated RAW copy for .%s", async (extension, outputPath) => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: false });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), `/tmp/sample.${extension}`);

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: `/tmp/sample.${extension}`,
				saveAsCopy: true,
				outputPath,
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath,
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

	it("routes copy-mode video through one verified final transaction", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: true,
			transactionResult: {
				ok: true,
				value: { outputPath: "/dir/video_cleaned.mp4" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/video.mp4",
				generatedPath: "/dir/video_cleaned.mp4",
				commitPath: undefined,
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/video_cleaned.mp4",
			wasForcedCopy: false,
		});
	});

	it("stages overwrite-mode video beside the original before publishing it", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: { ok: true, value: { outputPath: "/dir/video.mp4" } },
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/video.mp4",
				generatedPath: "/dir/.video.exifcleaner-stage-test-uuid.mp4",
				commitPath: "/dir/video.mp4",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/video.mp4",
			wasForcedCopy: false,
		});
	});

	it("returns a cleanup failure with only the exact residual path", async () => {
		const residualPath = "/dir/.video.exifcleaner-stage-test-uuid.mp4";
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: { code: "cleanup-failed", residualPath },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "cleanup",
			detail: "Generated output cleanup failed",
			residualPath,
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
