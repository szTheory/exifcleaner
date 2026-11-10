import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
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
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { fakeTransactionFileDependencies } from "../helpers/transaction_deps";

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
	executeResult = {
		ok: true,
		value: { tagsRemoved: 0, writtenBy: "exiftool" },
	},
	transactionResult,
	writtenBy = "exiftool",
	readMetadataResult = { ok: true, value: { Make: "camera" } },
}: {
	saveAsCopy: boolean;
	removeXattrs?: boolean;
	writtenBy?: "native" | "exiftool";
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
					value: {
						outputPath: request.commitPath ?? request.generatedPath,
						writtenBy,
					},
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
	metadataEngine: FakeMetadataEngine;
} {
	const metadataEngine = new FakeMetadataEngine();
	metadataEngine.inspectResult = {
		ok: true,
		value: {
			metadata: {},
			recordCount: 1,
			verification: { fileType: "JPEG", error: undefined },
		},
	};
	const stripMetadata = new StripMetadataCommand({ metadataEngine });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
		metadataEngine,
	});
	const outputTransaction = new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		...fakeTransactionFileDependencies(),
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

	return { container, metadataEngine };
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
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.jpg",
		},
		{
			name: "JPEG alias",
			filePath: "/tmp/sample.jpeg",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.jpeg",
		},
		{
			name: "mixed-case JPEG",
			filePath: "/tmp/sample.JpG",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.JpG",
		},
		{
			name: "PNG",
			filePath: "/tmp/sample.png",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.png",
		},
		{
			name: "copy-mode JPEG (D-11, ADP-03)",
			filePath: "/tmp/sample.jpg",
			saveAsCopy: true,
			verifierPath: "/tmp/sample_cleaned.jpg",
		},
		{
			name: "copy-mode PNG (D-11, ADP-03)",
			filePath: "/tmp/sample.png",
			saveAsCopy: true,
			verifierPath: "/tmp/sample_cleaned.png",
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
		{
			name: "copy-mode TIFF",
			filePath: "/tmp/sample.tif",
			saveAsCopy: true,
			verifierPath: "/tmp/sample_cleaned.tif",
		},
		{
			name: "overwrite-mode TIFF",
			filePath: "/tmp/sample.tif",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.tif",
		},
		{
			name: "overwrite-mode .tiff",
			filePath: "/tmp/sample.tiff",
			saveAsCopy: false,
			verifierPath: "/tmp/.sample.exifcleaner-stage-test-uuid.tiff",
		},
	])(
		"uses the exact main-process port count for $name",
		async ({ filePath, saveAsCopy, verifierPath }) => {
			const { container, metadataEngine } = makePortCountContainer({
				saveAsCopy,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), filePath);

			const sanitizeCalls = metadataEngine.calls.filter(
				(call) => call.method === "sanitize",
			);
			const verifierInspections = metadataEngine.calls.filter(
				(call) =>
					call.method === "inspect" &&
					call.request.purpose === "output-verification",
			);
			expect(sanitizeCalls).toHaveLength(1);
			expect(verifierInspections).toHaveLength(
				verifierPath === undefined ? 0 : 1,
			);
			if (verifierPath !== undefined) {
				expect(verifierInspections[0]?.request).toEqual({
					source: verifierPath,
					purpose: "output-verification",
				});
			}
		},
	);

	it("returns and writes generated copy path when save-as-copy has no collision (a format outside the verified copy set)", async () => {
		// D-11/ADP-03 widened png/jpg/jpeg into the verified copy set, so this direct-stripMetadata
		// exercise now uses .gif -- unaffected by that widening -- to keep testing the unverified
		// path. Copy-mode jpg/png routing through the transaction is covered by its own tests below.
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.gif");

		expect(stripMetadata.execute).toHaveBeenCalledWith({
			filePath: "/dir/photo.gif",
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: true,
			preserveTimestamps: false,
			saveAsCopy: true,
			outputPath: "/dir/photo_cleaned.gif",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.gif",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("awaits xattr clearing on the main-owned output path only when enabled (a format outside the verified copy set)", async () => {
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: true,
			removeXattrs: true,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.gif");

		expect(removeXattrCommand.execute).toHaveBeenCalledTimes(1);
		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/photo_cleaned.gif",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.gif",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("routes a jpg save-as-copy through the verified transaction with copyModeLeakCheck built from settings (D-11, ADP-03)", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: true,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/photo.jpg",
				generatedPath: "/dir/photo_cleaned.jpg",
				commitPath: undefined,
				copyModeLeakCheck: {
					demand: "required",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				},
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.jpg",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
			evidence: { engine: "exiftool", outputMode: "copy", leakCheck: "passed" },
		});
	});

	it("routes a png save-as-copy through the verified transaction with copyModeLeakCheck built from settings (D-11, ADP-03)", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: true,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.png");

		expect(stripMetadata.execute).not.toHaveBeenCalled();
		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/photo.png",
				generatedPath: "/dir/photo_cleaned.png",
				commitPath: undefined,
				copyModeLeakCheck: {
					demand: "required",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				},
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.png",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
			evidence: { engine: "exiftool", outputMode: "copy", leakCheck: "passed" },
		});
	});

	it.each([
		["tif save-as-copy", "/dir/scan.tif", "/dir/scan_cleaned.tif"],
		["RAW save-as-copy", "/dir/sample.dng", "/dir/sample_cleaned.dng"],
		["mp4 save-as-copy", "/dir/clip.mp4", "/dir/clip_cleaned.mp4"],
	])(
		"passes copyModeLeakCheck with demand when-allowlisted for a %s (D-08)",
		async (_name, filePath, generatedPath) => {
			const { container, outputTransaction } = makeContainer({
				saveAsCopy: true,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), filePath);

			expect(outputTransaction.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					filePath,
					generatedPath,
					copyModeLeakCheck: expect.objectContaining({
						demand: "when-allowlisted",
					}),
				}),
			);
		},
	);

	it.each([
		["/dir/photo.webp", "/dir/photo_cleaned.webp"],
		["/dir/PHOTO.WEBP", "/dir/PHOTO_cleaned.WEBP"],
	])(
		"passes copyModeLeakCheck with demand required for a webp save-as-copy %s (69-09, WEBP-08)",
		async (filePath, generatedPath) => {
			const { container, outputTransaction } = makeContainer({
				saveAsCopy: true,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), filePath);

			expect(outputTransaction.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					filePath,
					generatedPath,
					copyModeLeakCheck: {
						demand: "required",
						preserveOrientation: true,
						preserveColorProfile: true,
						preserveResolution: true,
					},
				}),
			);
		},
	);

	it("passes copyModeLeakCheck with demand required for a heic save-as-copy (D-08)", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: true,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		await handler(makeAuthorizedEvent(), "/dir/photo.heic");

		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				copyModeLeakCheck: expect.objectContaining({ demand: "required" }),
			}),
		);
	});

	it.each([
		"/dir/photo.jpg",
		"/dir/photo.jpeg",
		"/dir/PHOTO.JPG",
		"/dir/photo.png",
		"/dir/photo.webp",
		"/dir/PHOTO.WEBP",
		"/dir/photo.heic",
		"/dir/photo.heif",
		"/dir/photo.avif",
	])(
		"routes an overwrite of %s through the verified staged transaction with the leak demand required (OVR-01, D-08)",
		async (filePath) => {
			const { container, stripMetadata, outputTransaction } = makeContainer({
				saveAsCopy: false,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			const result = await handler(makeAuthorizedEvent(), filePath);

			// The legacy in-place branch is not taken; the transaction owns the write.
			expect(stripMetadata.execute).not.toHaveBeenCalled();
			expect(outputTransaction.execute).toHaveBeenCalledTimes(1);
			const parsed = path.parse(filePath);
			const stage = `${parsed.dir}/.${parsed.name}.exifcleaner-stage-test-uuid${parsed.ext}`;
			expect(outputTransaction.execute).toHaveBeenCalledWith({
				filePath,
				generatedPath: stage,
				commitPath: filePath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
				copyModeLeakCheck: {
					demand: "required",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				},
			});
			expect(result).toEqual({
				success: true,
				outputPath: filePath,
				wasForcedCopy: false,
				wroteFile: true,
				outputSize: 4096,
				evidence: {
					engine: "exiftool",
					outputMode: "overwrite",
					leakCheck: "passed",
				},
			});
		},
	);

	it("carries the current preserve settings into the overwrite demand (OVR-01)", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
		});
		const base = container.settings.get();
		(container as unknown as { settings: { get: () => unknown } }).settings = {
			get: () => ({
				...base,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: true,
			}),
		};
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		await handler(makeAuthorizedEvent(), "/dir/photo.webp");

		expect(outputTransaction.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				commitPath: "/dir/photo.webp",
				copyModeLeakCheck: {
					demand: "required",
					preserveOrientation: false,
					preserveColorProfile: false,
					preserveResolution: true,
				},
			}),
		);
	});

	it.each([
		{
			error: {
				code: "verification-failed" as const,
				verificationCode: "output-metadata-leak" as const,
				diagnostic: "GPS:GPSLatitude",
			},
			failureKind: "verification",
			detail:
				"Generated output verification failed (output-metadata-leak): GPS:GPSLatitude",
		},
		{
			error: { code: "commit-failed" as const },
			failureKind: "commit",
			detail: "Generated output commit failed",
		},
	])(
		"a failed staged overwrite of a webp is reported as failureKind $failureKind and does not claim a written file (OVR-01, D-09)",
		async ({ error, failureKind, detail }) => {
			const { container, stripMetadata } = makeContainer({
				saveAsCopy: false,
				transactionResult: { ok: false, error },
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			const result = await handler(makeAuthorizedEvent(), "/dir/photo.webp");

			expect(stripMetadata.execute).not.toHaveBeenCalled();
			expect(result).toEqual({ success: false, failureKind, detail });
		},
	);

	it("passes no copyModeLeakCheck for a tif overwrite (D-08; a RAW overwrite is a forced copy)", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		await handler(makeAuthorizedEvent(), "/dir/sample.tif");

		const call = outputTransaction.execute.mock.calls[0]?.[0];
		expect(call).toBeDefined();
		expect(call).not.toHaveProperty("copyModeLeakCheck");
	});

	it.each([
		{
			name: "a natively written webp copy (the 4.8.0 default)",
			filePath: "/dir/photo.webp",
			saveAsCopy: true,
			writtenBy: "native" as const,
			expected: { engine: "native", outputMode: "copy", leakCheck: "passed" },
		},
		{
			name: "a natively written jpg overwrite",
			filePath: "/dir/photo.jpg",
			saveAsCopy: false,
			writtenBy: "native" as const,
			expected: {
				engine: "native",
				outputMode: "overwrite",
				leakCheck: "passed",
			},
		},
		{
			name: "an ExifTool-written png overwrite",
			filePath: "/dir/photo.png",
			saveAsCopy: false,
			writtenBy: "exiftool" as const,
			expected: {
				engine: "exiftool",
				outputMode: "overwrite",
				leakCheck: "passed",
			},
		},
		{
			name: "a RAW file with save-as-copy off (forced copy, the optional check is not claimed)",
			filePath: "/dir/sample.dng",
			saveAsCopy: false,
			writtenBy: "exiftool" as const,
			expected: {
				engine: "exiftool",
				outputMode: "copy",
				leakCheck: "not-run",
			},
		},
		{
			name: "a tif copy written natively (demand when-allowlisted is not claimed as passed)",
			filePath: "/dir/scan.tif",
			saveAsCopy: true,
			writtenBy: "native" as const,
			expected: { engine: "native", outputMode: "copy", leakCheck: "not-run" },
		},
	])(
		"reports exact evidence for $name (69-14, D-17)",
		async ({ filePath, saveAsCopy, writtenBy, expected }) => {
			const { container } = makeContainer({ saveAsCopy, writtenBy });
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			const result = (await handler(makeAuthorizedEvent(), filePath)) as {
				success: true;
				evidence?: Record<string, unknown>;
			};

			expect(result.success).toBe(true);
			expect(result.evidence).toStrictEqual(expected);
			// Privacy: three enums, no path, tag value or hash.
			const evidence = result.evidence ?? {};
			expect(Object.keys(evidence).sort()).toEqual([
				"engine",
				"leakCheck",
				"outputMode",
			]);
			expect(["native", "exiftool"]).toContain(evidence["engine"]);
			expect(["copy", "overwrite"]).toContain(evidence["outputMode"]);
			expect(["passed", "not-run"]).toContain(evidence["leakCheck"]);
			for (const value of Object.values(evidence)) {
				expect(String(value)).not.toMatch(/[\\/.]/);
			}
		},
	);

	it("carries the evidence through the xattr postcondition when remove-xattrs is on (69-14)", async () => {
		const { container, removeXattrCommand } = makeContainer({
			saveAsCopy: true,
			removeXattrs: true,
			writtenBy: "native",
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.webp");

		expect(removeXattrCommand.execute).toHaveBeenCalledTimes(1);
		expect(result).toStrictEqual({
			success: true,
			outputPath: "/dir/photo_cleaned.webp",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
			evidence: { engine: "native", outputMode: "copy", leakCheck: "passed" },
		});
	});

	it("omits the evidence key on the legacy branch and on the zero-tag xattr early exit (69-14)", async () => {
		const legacyCopy = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container: legacyCopy.container });
		let { handler } = captureInvokeHandler("exif:remove");
		const gifCopy = await handler(makeAuthorizedEvent(), "/dir/photo.gif");
		expect(gifCopy).toMatchObject({ success: true });
		expect(Object.keys(gifCopy as object)).not.toContain("evidence");

		const legacyOverwrite = makeContainer({ saveAsCopy: false });
		ipcHandleMock.mockClear();
		setupExifHandlers({ container: legacyOverwrite.container });
		({ handler } = captureInvokeHandler("exif:remove"));
		const gifOverwrite = await handler(makeAuthorizedEvent(), "/dir/photo.gif");
		expect(gifOverwrite).toMatchObject({ success: true });
		expect(Object.keys(gifOverwrite as object)).not.toContain("evidence");

		const zeroTag = makeContainer({
			saveAsCopy: false,
			removeXattrs: true,
			readMetadataResult: { ok: true, value: {} },
		});
		ipcHandleMock.mockClear();
		setupExifHandlers({ container: zeroTag.container });
		({ handler } = captureInvokeHandler("exif:remove"));
		const early = await handler(makeAuthorizedEvent(), "/dir/clean.jpg");
		expect(early).toMatchObject({ success: true, wroteFile: false });
		expect(Object.keys(early as object)).not.toContain("evidence");
		expect(zeroTag.outputTransaction.execute).not.toHaveBeenCalled();
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

	it("preserves copy-mode semantics for an already-clean xattr request (a format outside the verified copy set)", async () => {
		const { container, stripMetadata, removeXattrCommand } = makeContainer({
			saveAsCopy: true,
			removeXattrs: true,
			readMetadataResult: { ok: true, value: {} },
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/clean.gif");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/clean.gif",
				saveAsCopy: true,
				outputPath: "/dir/clean_cleaned.gif",
			}),
		);
		expect(removeXattrCommand.execute).toHaveBeenCalledWith({
			filePath: "/dir/clean_cleaned.gif",
		});
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/clean_cleaned.gif",
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
			evidence: {
				engine: "exiftool",
				outputMode: "overwrite",
				leakCheck: "passed",
			},
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
			evidence: {
				engine: "exiftool",
				outputMode: "overwrite",
				leakCheck: "passed",
			},
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
			evidence: {
				engine: "exiftool",
				outputMode: "copy",
				leakCheck: "not-run",
			},
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
				evidence: {
					engine: "exiftool",
					outputMode: "copy",
					leakCheck: "not-run",
				},
			});
		},
	);

	it("passes and returns an absolute root copy path (a format outside the verified copy set)", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/photo.gif");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/photo.gif",
				outputPath: "/photo_cleaned.gif",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/photo_cleaned.gif",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("returns and writes collision suffix without mutating the request path (a format outside the verified copy set)", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: true });
		existsSyncMock.mockImplementation((candidate: string) => {
			return candidate === "/dir/photo_cleaned.gif";
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.gif");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/photo.gif",
				saveAsCopy: true,
				outputPath: "/dir/photo_cleaned_2.gif",
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo_cleaned_2.gif",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("returns and writes the source path when overwrite mode is active (a format outside the verified set; the seven image extensions overwrite through the transaction since 4.8.0)", async () => {
		const { container, stripMetadata } = makeContainer({ saveAsCopy: false });
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.gif");

		expect(stripMetadata.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: "/dir/photo.gif",
				outputMode: "overwrite",
				saveAsCopy: false,
				outputPath: undefined,
			}),
		);
		expect(result).toEqual({
			success: true,
			outputPath: "/dir/photo.gif",
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 4096,
		});
	});

	it("returns explicit error without a success output path when stripping fails (a format outside the verified copy set)", async () => {
		const { container, stripMetadata } = makeContainer({
			saveAsCopy: true,
			executeResult: {
				ok: false,
				error: { code: "exiftool-error", detail: "Permission denied" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.gif");

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
				value: { outputPath: "/dir/video_cleaned.mp4", writtenBy: "exiftool" },
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
			evidence: {
				engine: "exiftool",
				outputMode: "copy",
				leakCheck: "not-run",
			},
		});
	});

	it("stages overwrite-mode video beside the original before publishing it", async () => {
		const { container, stripMetadata, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: true,
				value: { outputPath: "/dir/video.mp4", writtenBy: "exiftool" },
			},
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
			evidence: {
				engine: "exiftool",
				outputMode: "overwrite",
				leakCheck: "not-run",
			},
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

	it("returns a timed-out write failure detail with no residualPath key when none is carried", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: { code: "write-failed", timedOut: true },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "write",
			detail: "Generated output write failed: exceeded the write time limit",
		});
		expect("residualPath" in (result as object)).toBe(false);
	});

	it("returns a timed-out write failure with the exact residual path when one is carried", async () => {
		const residualPath = "/dir/.video.exifcleaner-stage-test-uuid.mp4";
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: { code: "write-failed", timedOut: true, residualPath },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "write",
			detail: "Generated output write failed: exceeded the write time limit",
			residualPath,
		});
	});

	it("returns a generic write failure detail with no residualPath key", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: { code: "write-failed" },
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "write",
			detail: "Generated output write failed",
		});
		expect("residualPath" in (result as object)).toBe(false);
	});

	it("returns a verification terminal failure without publishing an output path, old text when no diagnostic is carried", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
				},
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

	it("a leak verdict carrying no diagnostic keeps the old fixed IPC text (D-10, D-11)", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: true,
			transactionResult: {
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
				},
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "verification",
			detail: "Generated output verification failed",
		});
		expect(result).not.toHaveProperty("outputPath");
	});

	it("appends the verification code and leaked tag names to the verification detail (69-04, D-20)", async () => {
		const { container, outputTransaction } = makeContainer({
			saveAsCopy: true,
			transactionResult: {
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic: "File:YCbCrSubSampling",
				},
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

		expect(outputTransaction.execute).toHaveBeenCalledOnce();
		expect(result).toEqual({
			success: false,
			failureKind: "verification",
			detail:
				"Generated output verification failed (output-metadata-leak): File:YCbCrSubSampling",
		});
		expect(result).not.toHaveProperty("outputPath");
	});

	it("appends the fixed reopen detail for a non-leak verification failure (69-04)", async () => {
		const { container } = makeContainer({
			saveAsCopy: false,
			transactionResult: {
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
					diagnostic:
						"ExifTool could not reopen the generated output (engine-error)",
				},
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/video.mp4");

		expect(result).toEqual({
			success: false,
			failureKind: "verification",
			detail:
				"Generated output verification failed (output-verification-failed): ExifTool could not reopen the generated output (engine-error)",
		});
	});

	it("passes a markup-bearing tag name through as plain text without altering it (T-69-10)", async () => {
		const { container } = makeContainer({
			saveAsCopy: true,
			transactionResult: {
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic: "PNG:<img src=x onerror=alert(1)>",
				},
			},
		});
		setupExifHandlers({ container });

		const { handler } = captureInvokeHandler("exif:remove");
		const result = await handler(makeAuthorizedEvent(), "/dir/photo.png");

		expect(result).toEqual({
			success: false,
			failureKind: "verification",
			detail:
				"Generated output verification failed (output-metadata-leak): PNG:<img src=x onerror=alert(1)>",
		});
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

function makeContainerWithPreserveResolution({
	saveAsCopy,
	preserveResolution,
}: {
	saveAsCopy: boolean;
	preserveResolution: boolean;
}): {
	container: Container;
	stripMetadata: { execute: ReturnType<typeof vi.fn> };
	outputTransaction: { execute: ReturnType<typeof vi.fn> };
} {
	const stripMetadata = {
		execute: vi.fn(async () => ({
			ok: true,
			value: { tagsRemoved: 0, writtenBy: "exiftool" },
		})),
	};
	const outputTransaction = {
		execute: vi.fn(async (request) => ({
			ok: true,
			value: { outputPath: request.commitPath ?? request.generatedPath },
		})),
	};
	const removeXattrCommand = { execute: vi.fn(async () => undefined) };
	const container = {
		settings: {
			get: () => ({
				...DEFAULT_SETTINGS,
				saveAsCopy,
				preserveResolution,
			}),
		},
		readMetadata: {
			execute: vi.fn(async () => ({ ok: true, value: { Make: "camera" } })),
		},
		stripMetadata,
		outputTransaction,
		removeXattrCommand,
	} as unknown as Container;
	return { container, stripMetadata, outputTransaction };
}

describe("exif:remove forwards the actual preserveResolution setting (FID-01, D-40)", () => {
	it.each([true, false])(
		"a .gif request reaches stripMetadata.execute with preserveResolution %s (FID-01, D-40)",
		async (preserveResolution) => {
			const { container, stripMetadata } = makeContainerWithPreserveResolution({
				saveAsCopy: false,
				preserveResolution,
			});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), "/dir/photo.gif");

			expect(stripMetadata.execute).toHaveBeenCalledWith(
				expect.objectContaining({ preserveResolution }),
			);
		},
	);

	it.each([true, false])(
		"a .jpg overwrite request reaches outputTransaction.execute with preserveResolution %s in the request and in the leak check (FID-01, D-40, OVR-01)",
		async (preserveResolution) => {
			const { container, stripMetadata, outputTransaction } =
				makeContainerWithPreserveResolution({
					saveAsCopy: false,
					preserveResolution,
				});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), "/dir/photo.jpg");

			expect(stripMetadata.execute).not.toHaveBeenCalled();
			expect(outputTransaction.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					preserveResolution,
					copyModeLeakCheck: expect.objectContaining({ preserveResolution }),
				}),
			);
		},
	);

	it.each([true, false])(
		"a .tif request reaches outputTransaction.execute with preserveResolution %s (FID-01, D-40)",
		async (preserveResolution) => {
			const { container, outputTransaction } =
				makeContainerWithPreserveResolution({
					saveAsCopy: false,
					preserveResolution,
				});
			setupExifHandlers({ container });

			const { handler } = captureInvokeHandler("exif:remove");
			await handler(makeAuthorizedEvent(), "/dir/scan.tif");

			expect(outputTransaction.execute).toHaveBeenCalledWith(
				expect.objectContaining({ preserveResolution }),
			);
		},
	);
});
