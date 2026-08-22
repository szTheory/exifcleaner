import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { Container } from "../../src/main/container";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import {
	registerAllowedSender,
	unregisterSender,
} from "../../src/main/ipc/ipc_validation";
import { setupExifHandlers } from "../../src/main/exif_handlers";
import { OutputTransaction } from "../../src/main/output_transaction";
import { FakeExifTool } from "../fakes/fake_exiftool";

const ipcHandleMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const randomUUIDMock = vi.hoisted(() => vi.fn(() => "test-uuid"));
const statMock = vi.hoisted(() => vi.fn(async () => ({ size: 4096 })));
const appMock = vi.hoisted(() => {
	const listeners = new Map<string, Set<(value: unknown) => void>>();
	return {
		isPackaged: false,
		on(event: string, listener: (value: unknown) => void): void {
			const eventListeners = listeners.get(event) ?? new Set();
			eventListeners.add(listener);
			listeners.set(event, eventListeners);
		},
		removeListener(event: string, listener: (value: unknown) => void): void {
			listeners.get(event)?.delete(listener);
		},
		emit(event: string, value: unknown): void {
			for (const listener of listeners.get(event) ?? []) {
				listener(value);
			}
		},
		listenerCount(event: string): number {
			return listeners.get(event)?.size ?? 0;
		},
	};
});

vi.mock("electron", () => ({
	app: appMock,
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

vi.mock("node:fs/promises", () => ({
	stat: statMock,
}));

const TEST_SENDER_ID = 304;
const originalNodeEnv = process.env.NODE_ENV;

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
	removeXattrs = false,
	executeResult = { ok: true, value: { tagsRemoved: 0 } },
	transactionResult,
	readMetadataResult = { ok: true, value: { Make: "camera" } },
}: {
	saveAsCopy: boolean;
	removeXattrs?: boolean;
	executeResult?: Awaited<ReturnType<Container["stripMetadata"]["execute"]>>;
	transactionResult?: Awaited<
		ReturnType<Container["outputTransaction"]["execute"]>
	>;
	readMetadataResult?: Awaited<
		ReturnType<Container["readMetadata"]["execute"]>
	>;
}): {
	container: Container;
	stripMetadata: { execute: ReturnType<typeof vi.fn> };
	outputTransaction: { execute: ReturnType<typeof vi.fn> };
	removeXattrCommand: { execute: ReturnType<typeof vi.fn> };
} {
	const stripMetadata = {
		execute: vi.fn(async () => executeResult),
	};
	const outputTransaction = {
		execute: vi.fn(async (request) => {
			return (
				transactionResult ?? {
					ok: true,
					value: { outputPath: request.commitPath ?? request.generatedPath },
				}
			);
		}),
	};
	const removeXattrCommand = { execute: vi.fn(async () => undefined) };
	const container = {
		settings: {
			get: () => ({
				...DEFAULT_SETTINGS,
				saveAsCopy,
				removeXattrs,
			}),
		},
		readMetadata: {
			execute: vi.fn(async () => readMetadataResult),
		},
		stripMetadata,
		outputTransaction,
		removeXattrCommand,
	} as unknown as Container;
	return { container, stripMetadata, outputTransaction, removeXattrCommand };
}

function makePortCountContainer({ saveAsCopy }: { saveAsCopy: boolean }): {
	container: Container;
	exiftool: FakeExifTool;
} {
	const exiftool = new FakeExifTool();
	exiftool.readResult = {
		ok: true,
		value: [{ FileType: "JPEG" }],
	};
	const stripMetadata = new StripMetadataCommand({ exiftool });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({ exiftool });
	const outputTransaction = new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		unlink: vi.fn(async () => undefined),
		rename: vi.fn(async () => undefined),
		delay: vi.fn(async () => undefined),
	});
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

	return { container, exiftool };
}

function makeAuthorizedEvent(): IpcMainInvokeEvent {
	registerAllowedSender(TEST_SENDER_ID);
	return { sender: { id: TEST_SENDER_ID } } as IpcMainInvokeEvent;
}

beforeEach(() => {
	ipcHandleMock.mockClear();
	existsSyncMock.mockReset();
	existsSyncMock.mockReturnValue(false);
	appMock.isPackaged = false;
	statMock.mockClear();
	process.env.NODE_ENV = "test";
});

afterEach(() => {
	unregisterSender(TEST_SENDER_ID);
	process.env.NODE_ENV = "test";
	setupExifHandlers({
		container: makeContainer({ saveAsCopy: false }).container,
	});
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
});

describe("exif:read handler", () => {
	it("rejects a failed metadata read instead of reporting an empty file", async () => {
		const { container } = makeContainer({
			saveAsCopy: false,
			readMetadataResult: {
				ok: false,
				error: { code: "exiftool-error", detail: "corrupt input" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:read");

		await expect(
			handler(makeAuthorizedEvent(), "/tmp/corrupt.jpg"),
		).rejects.toThrow("ExifTool error: corrupt input");
	});
});

describe("exif:remove handler", () => {
	it.each([
		{
			name: "JPEG",
			filePath: "/tmp/sample.jpg",
			saveAsCopy: false,
			verifierPath: undefined,
		},
		{
			name: "JPEG alias",
			filePath: "/tmp/sample.jpeg",
			saveAsCopy: false,
			verifierPath: undefined,
		},
		{
			name: "mixed-case JPEG",
			filePath: "/tmp/sample.JpG",
			saveAsCopy: false,
			verifierPath: undefined,
		},
		{
			name: "PNG",
			filePath: "/tmp/sample.png",
			saveAsCopy: false,
			verifierPath: undefined,
		},
		{
			name: "supported RAW copy",
			filePath: "/tmp/sample.cr2",
			saveAsCopy: false,
			verifierPath: "/tmp/sample_cleaned.cr2",
		},
		{
			name: "copy-mode video",
			filePath: "/tmp/sample.mp4",
			saveAsCopy: true,
			verifierPath: "/tmp/sample_cleaned.mp4",
		},
		{
			name: "overwrite-mode video",
			filePath: "/tmp/sample.mp4",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.mp4",
		},
		{
			name: "overwrite-mode audio",
			filePath: "/tmp/sample.m4a",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.m4a",
		},
	])(
		"uses the exact main-process port count for $name",
		async ({ filePath, saveAsCopy, verifierPath }) => {
			const { container, exiftool } = makePortCountContainer({ saveAsCopy });
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), filePath);

			const removeCalls = exiftool.calls.filter(
				(call) => call.method === "removeMetadata",
			);
			const verifierReads = exiftool.calls.filter(
				(call) => call.method === "readMetadata",
			);
			expect(removeCalls).toHaveLength(1);
			expect(verifierReads).toHaveLength(verifierPath === undefined ? 0 : 1);
			if (verifierPath !== undefined) {
				expect(verifierReads[0]?.args[0]).toBe(verifierPath);
			}
		},
	);

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
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("awaits xattr clearing on the main-owned output path only when enabled", async () => {
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: true,
			removeXattrs: true,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(removeXattrCommand.execute).toHaveBeenCalledTimes(1);
		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/photo_cleaned.jpg",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.jpg",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("clears only xattrs without rewriting an already-clean file", async () => {
		const { container, stripMetadata, outputTransaction, removeXattrCommand } =
			makeContainer({
				saveAsCopy: false,
				removeXattrs: true,
				readMetadataResult: { ok: true, value: {} },
			});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/clean.jpg");

		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/clean.jpg",
		});
		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).not.toHaveBeenCalled();
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/clean.jpg",
			wasForcedCopy: false,
			wroteFile: false,
			outputSize: 4096,
		});
	});

	it("preserves copy-mode semantics for an already-clean xattr request", async () => {
		const { container, stripMetadata, removeXattrCommand } = makeContainer({
			saveAsCopy: true,
			removeXattrs: true,
			readMetadataResult: { ok: true, value: {} },
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/clean.jpg");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/clean.jpg",
				saveAsCopy: true,
				outputPath: "/dir/clean_cleaned.jpg",
			}),
		);
		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/clean_cleaned.jpg",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/clean_cleaned.jpg",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("does not explicitly clear xattrs when remove-xattrs is disabled", async () => {
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: false,
			removeXattrs: false,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo.jpg",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
		expect(removeXattrCommand.execute).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "packaged app",
			isPackaged: true,
			nodeEnv: "development",
			marker: "/dir/photo.jpg",
		},
		{
			name: "non-development app",
			isPackaged: false,
			nodeEnv: "test",
			marker: "/dir/photo.jpg",
		},
		{
			name: "non-equal path marker",
			isPackaged: false,
			nodeEnv: "development",
			marker: "/dir/other.jpg",
		},
	])("leaves the dev xattr failure seam inert for $name", async (scenario) => {
		appMock.isPackaged = scenario.isPackaged;
		process.env.NODE_ENV = scenario.nodeEnv;
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: false,
			removeXattrs: true,
		});
		setupExifHandlers({ container });
		appMock.emit("exifcleaner:dev-xattr-failure-path", scenario.marker);

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo.jpg",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/photo.jpg",
		});
	});

	it("returns the native-shaped xattr failure for an exact dev marker match", async () => {
		process.env.NODE_ENV = "development";
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: false,
			removeXattrs: true,
		});
		setupExifHandlers({ container });
		appMock.emit("exifcleaner:dev-xattr-failure-path", "/dir/photo.jpg");

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(result).toEqual({
			success: false,
			failureKind: "xattr",
			detail:
				"Embedded metadata was removed, but macOS extended attributes could not be cleared: deterministic development failure",
			residualPath: "/dir/photo.jpg",
		});
		expect(removeXattrCommand.execute).not.toHaveBeenCalled();
	});

	it("consumes an exact dev failure path once without accumulating listeners", async () => {
		process.env.NODE_ENV = "development";
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: false,
			removeXattrs: true,
		});
		setupExifHandlers({ container });
		setupExifHandlers({ container });
		expect(appMock.listenerCount("exifcleaner:dev-xattr-failure-path")).toBe(1);
		appMock.emit("exifcleaner:dev-xattr-failure-path", "/dir/photo.jpg");

		const { handler } = captureInvokeHandler("exif:remove");
		await expect(
			handler(makeAuthorizedEvent(), "/dir/photo.jpg"),
		).resolves.toMatchObject({
			success: false,
			failureKind: "xattr",
		});
		await expect(
			handler(makeAuthorizedEvent(), "/dir/photo.jpg"),
		).resolves.toMatchObject({
			success: true,
			outputPath: "/dir/photo.jpg",
		});
		expect(removeXattrCommand.execute).toHaveBeenCalledOnce();
	});

	it("returns a truthful terminal xattr failure without a success output path", async () => {
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: false,
			removeXattrs: true,
		});
		removeXattrCommand.execute.mockRejectedValue(
			new Error("permission denied"),
		);
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(result).toEqual({
			success: false,
			failureKind: "xattr",
			detail:
				"Embedded metadata was removed, but macOS extended attributes could not be cleared: permission denied",
			residualPath: "/dir/photo.jpg",
		});
		expect(result).not.toHaveProperty("outputPath");
	});

	it("forces a collision-safe copy for supported RAW when save-as-copy is disabled", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: false,
		});
		existsSyncMock.mockImplementation((candidate: string) => {
			return candidate === "/tmp/sample_cleaned.cr2";
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/tmp/sample.cr2");

		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/tmp/sample.cr2",
				generatedPath: "/tmp/sample_cleaned_2.cr2",
				commitPath: undefined,
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/tmp/sample_cleaned_2.cr2",
			wasForcedCopy: true,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("refuses RAF before any write and identifies the unchanged original", async () => {
		const { container, stripMetadata, outputTransaction, removeXattrCommand } =
			makeContainer({ saveAsCopy: false, removeXattrs: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(
			makeAuthorizedEvent(),
			"/tmp/irreplaceable.RAF",
		);

		expect(result).toEqual({
			success: false,
			failureKind: "refused",
			refusalReason: "unsafe-raf-write",
			detail:
				"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
			originalPath: "/tmp/irreplaceable.RAF",
		});
		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).not.toHaveBeenCalled();
		expect(removeXattrCommand.execute).not.toHaveBeenCalled();
		expect(statMock).not.toHaveBeenCalled();
	});

	it.each([
		["cr2", "/tmp/sample_cleaned.cr2"],
		["cr3", "/tmp/sample_cleaned.cr3"],
		["nef", "/tmp/sample_cleaned.nef"],
		["arw", "/tmp/sample_cleaned.arw"],
		["orf", "/tmp/sample_cleaned.orf"],
		["rw2", "/tmp/sample_cleaned.rw2"],
		["dng", "/tmp/sample_cleaned.dng"],
		["pef", "/tmp/sample_cleaned.pef"],
		["srw", "/tmp/sample_cleaned.srw"],
		["Cr3", "/tmp/sample_cleaned.Cr3"],
	])(
		"returns the exact generated RAW copy for .%s",
		async (extension, outputPath) => {
			const { container, stripMetadata, outputTransaction } = makeContainer({
				saveAsCopy: false,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			const result = await handler(
				makeAuthorizedEvent(),
				`/tmp/sample.${extension}`,
			);

			expect(stripMetadata.execute).not.toHaveBeenCalled();
			expect(outputTransaction.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					filePath: `/tmp/sample.${extension}`,
					generatedPath: outputPath,
					commitPath: undefined,
				}),
			);
			expect(result).toEqual({
				success: true,
				outputPath,
				wasForcedCopy: true,
				wroteFile: true,
				outputSize: 4096,
			});
		},
	);

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
			wroteFile: true,
			outputSize: 4096,
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
			wroteFile: true,
			outputSize: 4096,
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
			wroteFile: true,
			outputSize: 4096,
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
			wroteFile: true,
			outputSize: 4096,
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
			wroteFile: true,
			outputSize: 4096,
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

	it("returns a verification terminal failure without publishing an output path", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: { code: "verification-failed" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "verification",
			detail: "Generated output verification failed",
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
