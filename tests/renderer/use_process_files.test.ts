import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileProcessingStatus } from "../../src/domain/files/file_status";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";
import type { AppAction } from "../../src/renderer/contexts/AppContext";

// Mock window.api
function createMockApi(): {
	exif: {
		readMetadata: ReturnType<typeof vi.fn>;
		removeMetadata: ReturnType<typeof vi.fn>;
	};
	files: {
		notifyFilesAdded: ReturnType<typeof vi.fn>;
		notifyFileProcessed: ReturnType<typeof vi.fn>;
		notifyAllFilesProcessed: ReturnType<typeof vi.fn>;
	};
} {
	return {
		exif: {
			readMetadata: vi.fn(),
			removeMetadata: vi.fn(),
		},
		files: {
			notifyFilesAdded: vi.fn(),
			notifyFileProcessed: vi.fn(),
			notifyAllFilesProcessed: vi.fn(),
		},
	};
}

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		id: overrides.id ?? "test-id-1",
		path: overrides.path ?? "/path/to/test.jpg",
		name: overrides.name ?? "test.jpg",
		extension: overrides.extension ?? "JPG",
		size: overrides.size ?? 1024,
		folder: overrides.folder ?? null,
		status: overrides.status ?? FileProcessingStatus.Pending,
		beforeTags: overrides.beforeTags ?? null,
		afterTags: overrides.afterTags ?? null,
		beforeMetadata: overrides.beforeMetadata ?? null,
		afterMetadata: overrides.afterMetadata ?? null,
		outputPath: overrides.outputPath ?? undefined,
		error: overrides.error ?? null,
	};
}

// Import the core processing function (non-hook logic extracted for testing)
import { processFileEntries } from "../../src/renderer/hooks/use_process_files";

describe("processFileEntries", () => {
	let mockApi: ReturnType<typeof createMockApi>;
	let dispatches: AppAction[];
	let mockDispatch: (action: AppAction) => void;

	beforeEach(() => {
		mockApi = createMockApi();
		dispatches = [];
		mockDispatch = (action: AppAction) => {
			dispatches.push(action);
		};

		// Set up window.api mock
		(globalThis as Record<string, unknown>).window = {
			api: {
				...mockApi,
				i18n: { getLocale: vi.fn(), getStrings: vi.fn() },
				files: {
					...mockApi.files,
					basename: vi.fn(),
					getPathForFile: vi.fn(),
					onFileOpenAddFiles: vi.fn(),
				},
				theme: { get: vi.fn(), onChanged: vi.fn() },
				settings: { get: vi.fn(), set: vi.fn(), onChanged: vi.fn() },
			},
		};
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).window;
	});

	it("dispatches UPDATE_FILE_STATUS 'reading' for each file", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValue({ tag1: "val1" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		const readingDispatches = dispatches.filter(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.Reading,
		);
		expect(readingDispatches).toHaveLength(1);
		expect(readingDispatches[0]).toEqual({
			type: "UPDATE_FILE_STATUS",
			id: "test-id-1",
			status: FileProcessingStatus.Reading,
		});
	});

	it("dispatches UPDATE_FILE_STATUS 'processing' after reading metadata", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValue({ tag1: "val1" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		const processingDispatches = dispatches.filter(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.Processing,
		);
		expect(processingDispatches).toHaveLength(1);

		// Processing comes after reading
		const readingIdx = dispatches.findIndex(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.Reading,
		);
		const processingIdx = dispatches.findIndex(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.Processing,
		);
		expect(processingIdx).toBeGreaterThan(readingIdx);
	});

	it("dispatches UPDATE_FILE_METADATA with before and after tag counts", async () => {
		const entry = makeFileEntry();
		// Before: 3 tags, After: 1 tag
		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ tag1: "v", tag2: "v", tag3: "v" })
			.mockResolvedValueOnce({ tag1: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		const metadataDispatches = dispatches.filter(
			(d) => d.type === "UPDATE_FILE_METADATA",
		);
		expect(metadataDispatches).toHaveLength(1);
		expect(metadataDispatches[0]).toEqual({
			type: "UPDATE_FILE_METADATA",
			id: "test-id-1",
			beforeTags: 3,
			afterTags: 1,
			beforeMetadata: { tag1: "v", tag2: "v", tag3: "v" },
			afterMetadata: { tag1: "v" },
			outputPath: "/path/to/test_cleaned.jpg",
		});
	});

	it("reads AFTER metadata from the returned output path and stores that path", async () => {
		const entry = makeFileEntry({ path: "/path/to/test.jpg" });
		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ before: "metadata" })
			.mockResolvedValueOnce({ after: "metadata" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned_2.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
			1,
			"/path/to/test.jpg",
		);
		expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
			2,
			"/path/to/test_cleaned_2.jpg",
		);
		expect(dispatches).toContainEqual({
			type: "UPDATE_FILE_METADATA",
			id: "test-id-1",
			beforeTags: 1,
			afterTags: 1,
			beforeMetadata: { before: "metadata" },
			afterMetadata: { after: "metadata" },
			outputPath: "/path/to/test_cleaned_2.jpg",
		});
	});

	it("copies the main-returned forced-copy fact only after the successful AFTER read", async () => {
		const entry = makeFileEntry({ path: "/path/to/sample.raf" });
		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ DateTimeOriginal: "2024:01:01 00:00:00" })
			.mockResolvedValueOnce({});
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/sample_cleaned.raf",
			wasForcedCopy: true,
		});

		await processFileEntries([entry], mockDispatch);

		expect(dispatches).toContainEqual({
			type: "UPDATE_FILE_METADATA",
			id: "test-id-1",
			beforeTags: 1,
			afterTags: 0,
			beforeMetadata: { DateTimeOriginal: "2024:01:01 00:00:00" },
			afterMetadata: {},
			outputPath: "/path/to/sample_cleaned.raf",
			wasForcedCopy: true,
		});
	});

	it("dispatches UPDATE_FILE_STATUS 'complete' on success", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ tag1: "v", tag2: "v" })
			.mockResolvedValueOnce({ tag1: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		const completeDispatches = dispatches.filter(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.Complete,
		);
		expect(completeDispatches).toHaveLength(1);
	});

	it("dispatches 'no-metadata-found' when beforeTags is 0", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValue({});
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.exif.removeMetadata).toHaveBeenCalledWith(
			"/path/to/test.jpg",
		);
		expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
			2,
			"/path/to/test_cleaned.jpg",
		);
		expect(dispatches).toContainEqual({
			type: "UPDATE_FILE_METADATA",
			id: "test-id-1",
			beforeTags: 0,
			afterTags: 0,
			beforeMetadata: {},
			afterMetadata: {},
			outputPath: "/path/to/test_cleaned.jpg",
		});
		const noMetadataDispatches = dispatches.filter(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.NoMetadataFound,
		);
		expect(noMetadataDispatches).toHaveLength(1);
	});

	it("skips AFTER read and output state when remove returns an explicit error", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValueOnce({ before: "metadata" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: false,
			error: "ExifTool error: Permission denied",
		});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.exif.readMetadata).toHaveBeenCalledTimes(1);
		expect(dispatches).toContainEqual({
			type: "UPDATE_FILE_ERROR",
			id: "test-id-1",
			error: "ExifTool error: Permission denied",
		});
		expect(
			dispatches.some(
				(d) =>
					d.type === "UPDATE_FILE_METADATA" &&
					"outputPath" in d &&
					d.outputPath === "/path/to/test_cleaned.jpg",
			),
		).toBe(false);
	});

	it.each([
		["verification", undefined],
		["cleanup", "/path/to/incomplete-output.jpg"],
	] as const)(
		"stores %s terminal failure details without reading AFTER metadata",
		async (failureKind, residualPath) => {
			const entry = makeFileEntry();
			mockApi.exif.readMetadata.mockResolvedValueOnce({ before: "metadata" });
			mockApi.exif.removeMetadata.mockResolvedValue({
				success: false,
				failureKind,
				detail: "Verification could not prove output safety",
				...(residualPath === undefined ? {} : { residualPath }),
			});

			await processFileEntries([entry], mockDispatch);

			expect(mockApi.exif.readMetadata).toHaveBeenCalledTimes(1);
			expect(dispatches).toContainEqual({
				type: "UPDATE_FILE_ERROR",
				id: "test-id-1",
				error: "Verification could not prove output safety",
				failureKind,
				detail: "Verification could not prove output safety",
				...(residualPath === undefined ? {} : { residualPath }),
			});
			expect(
				dispatches.some((action) => action.type === "UPDATE_FILE_METADATA"),
			).toBe(false);
			expect(mockApi.files.notifyFileProcessed).toHaveBeenCalledTimes(1);
		},
	);

	it("keeps a verification failure as an error row without AFTER or revealable output state", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValueOnce({ before: "metadata" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: false,
			failureKind: "verification",
			detail: "Generated output verification failed",
		});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.exif.readMetadata).toHaveBeenCalledTimes(1);
		expect(dispatches).toContainEqual({
			type: "UPDATE_FILE_ERROR",
			id: entry.id,
			error: "Generated output verification failed",
			failureKind: "verification",
			detail: "Generated output verification failed",
		});
		expect(
			dispatches.some((action) => action.type === "UPDATE_FILE_METADATA"),
		).toBe(false);
		expect(
			dispatches.some(
				(action) =>
					action.type === "UPDATE_FILE_STATUS" &&
					action.status === FileProcessingStatus.Complete,
			),
		).toBe(false);
	});

	it("dispatches UPDATE_FILE_ERROR on IPC failure", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockRejectedValue(new Error("ExifTool crashed"));

		await processFileEntries([entry], mockDispatch);

		const errorDispatches = dispatches.filter(
			(d) => d.type === "UPDATE_FILE_ERROR",
		);
		expect(errorDispatches).toHaveLength(1);
		expect(errorDispatches[0]).toEqual({
			type: "UPDATE_FILE_ERROR",
			id: "test-id-1",
			error: "ExifTool crashed",
		});
	});

	it("processes files sequentially (second file starts after first completes)", async () => {
		const entry1 = makeFileEntry({ id: "id-1", path: "/a.jpg" });
		const entry2 = makeFileEntry({ id: "id-2", path: "/b.jpg" });

		let callOrder: string[] = [];
		mockApi.exif.readMetadata.mockImplementation(async (path: string) => {
			callOrder.push(`read:${path}`);
			return { tag: "v" };
		});
		mockApi.exif.removeMetadata.mockImplementation(async (path: string) => {
			callOrder.push(`remove:${path}`);
			return {
				success: true,
				outputPath: path === "/a.jpg" ? "/a_cleaned.jpg" : "/b_cleaned.jpg",
			};
		});

		await processFileEntries([entry1, entry2], mockDispatch);

		// Expect: read /a.jpg, remove /a.jpg, read /a.jpg (after), then read /b.jpg, remove /b.jpg, read /b.jpg (after)
		expect(callOrder).toEqual([
			"read:/a.jpg",
			"remove:/a.jpg",
			"read:/a_cleaned.jpg",
			"read:/b.jpg",
			"remove:/b.jpg",
			"read:/b_cleaned.jpg",
		]);
	});

	it("keeps 200 JPEGs at exactly two renderer reads and one write each", async () => {
		const entries = Array.from({ length: 200 }, (_, index) => {
			const number = index + 1;
			return makeFileEntry({
				id: `jpeg-${number}`,
				path: `/batch/jpeg-${number}.jpg`,
				name: `jpeg-${number}.jpg`,
			});
		});
		mockApi.exif.readMetadata.mockResolvedValue({ metadata: "present" });
		mockApi.exif.removeMetadata.mockImplementation(async (path: string) => {
			return {
				success: true,
				outputPath: path.replace(/\.jpg$/, "_cleaned.jpg"),
			};
		});

		await processFileEntries(entries, mockDispatch);

		expect(mockApi.exif.readMetadata).toHaveBeenCalledTimes(400);
		expect(mockApi.exif.removeMetadata).toHaveBeenCalledTimes(200);
		expect(mockApi.files.notifyFileProcessed).toHaveBeenCalledTimes(200);
		expect(mockApi.files.notifyAllFilesProcessed).toHaveBeenCalledTimes(1);
		const completeDispatches = dispatches.filter(
			(action) =>
				action.type === "UPDATE_FILE_STATUS" &&
				action.status === FileProcessingStatus.Complete,
		);
		expect(completeDispatches).toHaveLength(200);

		for (const [index, entry] of entries.entries()) {
			expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
				index * 2 + 1,
				entry.path,
			);
			expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
				index * 2 + 2,
				entry.path.replace(/\.jpg$/, "_cleaned.jpg"),
			);
		}
	});

	it("stores each returned output path while processing two files sequentially", async () => {
		const entry1 = makeFileEntry({ id: "id-1", path: "/a.jpg" });
		const entry2 = makeFileEntry({ id: "id-2", path: "/b.jpg" });

		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ aBefore: "v" })
			.mockResolvedValueOnce({ aAfter: "v" })
			.mockResolvedValueOnce({ bBefore: "v" })
			.mockResolvedValueOnce({ bAfter: "v" });
		mockApi.exif.removeMetadata
			.mockResolvedValueOnce({ success: true, outputPath: "/a_cleaned_2.jpg" })
			.mockResolvedValueOnce({ success: true, outputPath: "/b_cleaned_4.jpg" });

		await processFileEntries([entry1, entry2], mockDispatch);

		expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
			2,
			"/a_cleaned_2.jpg",
		);
		expect(mockApi.exif.readMetadata).toHaveBeenNthCalledWith(
			4,
			"/b_cleaned_4.jpg",
		);
		expect(dispatches).toContainEqual(
			expect.objectContaining({
				type: "UPDATE_FILE_METADATA",
				id: "id-1",
				outputPath: "/a_cleaned_2.jpg",
			}),
		);
		expect(dispatches).toContainEqual(
			expect.objectContaining({
				type: "UPDATE_FILE_METADATA",
				id: "id-2",
				outputPath: "/b_cleaned_4.jpg",
			}),
		);
	});

	it("calls window.api.files.notifyFilesAdded with count at start", async () => {
		const entries = [
			makeFileEntry({ id: "id-1" }),
			makeFileEntry({ id: "id-2" }),
		];
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockImplementation(async (path: string) => ({
			success: true,
			outputPath: path,
		}));

		await processFileEntries(entries, mockDispatch);

		expect(mockApi.files.notifyFilesAdded).toHaveBeenCalledWith(2);
	});

	it("calls window.api.files.notifyAllFilesProcessed at end", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({
			success: true,
			outputPath: "/path/to/test_cleaned.jpg",
		});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.files.notifyAllFilesProcessed).toHaveBeenCalledTimes(1);
	});

	it("calls window.api.files.notifyFileProcessed for each file", async () => {
		const entries = [
			makeFileEntry({ id: "id-1" }),
			makeFileEntry({ id: "id-2" }),
		];
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockImplementation(async (path: string) => ({
			success: true,
			outputPath: path,
		}));

		await processFileEntries(entries, mockDispatch);

		expect(mockApi.files.notifyFileProcessed).toHaveBeenCalledTimes(2);
	});
});
