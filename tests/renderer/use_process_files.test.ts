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
		mockApi.exif.removeMetadata.mockResolvedValue({});

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
		mockApi.exif.removeMetadata.mockResolvedValue({});

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
		mockApi.exif.removeMetadata.mockResolvedValue({});

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
		});
	});

	it("dispatches UPDATE_FILE_STATUS 'complete' on success", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata
			.mockResolvedValueOnce({ tag1: "v", tag2: "v" })
			.mockResolvedValueOnce({ tag1: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({});

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
		mockApi.exif.removeMetadata.mockResolvedValue({});

		await processFileEntries([entry], mockDispatch);

		const noMetadataDispatches = dispatches.filter(
			(d) =>
				d.type === "UPDATE_FILE_STATUS" &&
				d.status === FileProcessingStatus.NoMetadataFound,
		);
		expect(noMetadataDispatches).toHaveLength(1);
	});

	it("dispatches UPDATE_FILE_ERROR on IPC failure", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockRejectedValue(
			new Error("ExifTool crashed"),
		);

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
			return {};
		});

		await processFileEntries([entry1, entry2], mockDispatch);

		// Expect: read /a.jpg, remove /a.jpg, read /a.jpg (after), then read /b.jpg, remove /b.jpg, read /b.jpg (after)
		expect(callOrder).toEqual([
			"read:/a.jpg",
			"remove:/a.jpg",
			"read:/a.jpg",
			"read:/b.jpg",
			"remove:/b.jpg",
			"read:/b.jpg",
		]);
	});

	it("calls window.api.files.notifyFilesAdded with count at start", async () => {
		const entries = [
			makeFileEntry({ id: "id-1" }),
			makeFileEntry({ id: "id-2" }),
		];
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({});

		await processFileEntries(entries, mockDispatch);

		expect(mockApi.files.notifyFilesAdded).toHaveBeenCalledWith(2);
	});

	it("calls window.api.files.notifyAllFilesProcessed at end", async () => {
		const entry = makeFileEntry();
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({});

		await processFileEntries([entry], mockDispatch);

		expect(mockApi.files.notifyAllFilesProcessed).toHaveBeenCalledTimes(1);
	});

	it("calls window.api.files.notifyFileProcessed for each file", async () => {
		const entries = [
			makeFileEntry({ id: "id-1" }),
			makeFileEntry({ id: "id-2" }),
		];
		mockApi.exif.readMetadata.mockResolvedValue({ tag: "v" });
		mockApi.exif.removeMetadata.mockResolvedValue({});

		await processFileEntries(entries, mockDispatch);

		expect(mockApi.files.notifyFileProcessed).toHaveBeenCalledTimes(2);
	});
});
