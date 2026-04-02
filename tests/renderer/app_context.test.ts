import { describe, it, expect } from "vitest";
import { FileProcessingStatus } from "../../src/domain/files/file_status";
import type { AppState, AppAction, FileEntry } from "../../src/renderer/contexts/AppContext";
import { appReducer } from "../../src/renderer/contexts/AppContext";

function makeFile(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		id: "file-1",
		path: "/Users/test/photos/image.jpg",
		name: "image.jpg",
		extension: "JPG",
		size: 1024,
		folder: null,
		status: FileProcessingStatus.Pending,
		beforeTags: null,
		afterTags: null,
		beforeMetadata: null,
		afterMetadata: null,
		error: null,
		...overrides,
	};
}

function makeInitialState(overrides: Partial<AppState> = {}): AppState {
	return {
		files: [],
		collapsedFolders: new Set<string>(),
		expandedRowId: null,
		folderStates: new Map(),
		...overrides,
	};
}

describe("appReducer", () => {
	describe("ADD_FILES", () => {
		it("appends new FileEntry objects to state.files without removing existing ones", () => {
			const existing = makeFile({ id: "existing-1", name: "existing.jpg" });
			const state = makeInitialState({ files: [existing] });
			const newFile = makeFile({ id: "new-1", name: "new.jpg" });

			const result = appReducer(state, {
				type: "ADD_FILES",
				files: [newFile],
			});

			expect(result.files).toHaveLength(2);
			expect(result.files[0]).toEqual(existing);
			expect(result.files[1]).toEqual(newFile);
		});

		it("preserves all fields of extended FileEntry", () => {
			const state = makeInitialState();
			const file = makeFile({
				id: "test-id",
				path: "/test/path.heic",
				name: "path.heic",
				extension: "HEIC",
				size: 2048,
				folder: "Camera Roll/",
				status: FileProcessingStatus.Pending,
				beforeTags: null,
				afterTags: null,
				error: null,
			});

			const result = appReducer(state, {
				type: "ADD_FILES",
				files: [file],
			});

			const added = result.files[0];
			expect(added).toBeDefined();
			expect(added!.id).toBe("test-id");
			expect(added!.path).toBe("/test/path.heic");
			expect(added!.name).toBe("path.heic");
			expect(added!.extension).toBe("HEIC");
			expect(added!.size).toBe(2048);
			expect(added!.folder).toBe("Camera Roll/");
			expect(added!.status).toBe(FileProcessingStatus.Pending);
			expect(added!.beforeTags).toBeNull();
			expect(added!.afterTags).toBeNull();
			expect(added!.beforeMetadata).toBeNull();
			expect(added!.afterMetadata).toBeNull();
			expect(added!.error).toBeNull();
		});
	});

	describe("CLEAR_FILES", () => {
		it("resets files to [], collapsedFolders to empty Set, expandedRowId to null", () => {
			const state = makeInitialState({
				files: [makeFile()],
				collapsedFolders: new Set(["folder1"]),
				expandedRowId: "some-id",
			});

			const result = appReducer(state, { type: "CLEAR_FILES" });

			expect(result.files).toEqual([]);
			expect(result.collapsedFolders.size).toBe(0);
			expect(result.expandedRowId).toBeNull();
		});
	});

	describe("UPDATE_FILE_STATUS", () => {
		it("changes status of file matching given id", () => {
			const file = makeFile({ id: "file-1" });
			const state = makeInitialState({ files: [file] });

			const result = appReducer(state, {
				type: "UPDATE_FILE_STATUS",
				id: "file-1",
				status: FileProcessingStatus.Reading,
			});

			expect(result.files[0]!.status).toBe(FileProcessingStatus.Reading);
		});

		it("leaves state unchanged for non-existent id", () => {
			const file = makeFile({ id: "file-1" });
			const state = makeInitialState({ files: [file] });

			const result = appReducer(state, {
				type: "UPDATE_FILE_STATUS",
				id: "non-existent",
				status: FileProcessingStatus.Reading,
			});

			expect(result.files[0]!.status).toBe(FileProcessingStatus.Pending);
		});
	});

	describe("UPDATE_FILE_METADATA", () => {
		it("sets beforeTags, afterTags, and metadata objects for matching file id", () => {
			const file = makeFile({ id: "file-1" });
			const state = makeInitialState({ files: [file] });
			const beforeMeta = { "Camera:Make": "Canon" };
			const afterMeta = {};

			const result = appReducer(state, {
				type: "UPDATE_FILE_METADATA",
				id: "file-1",
				beforeTags: 42,
				afterTags: 3,
				beforeMetadata: beforeMeta,
				afterMetadata: afterMeta,
			});

			expect(result.files[0]!.beforeTags).toBe(42);
			expect(result.files[0]!.afterTags).toBe(3);
			expect(result.files[0]!.beforeMetadata).toEqual(beforeMeta);
			expect(result.files[0]!.afterMetadata).toEqual(afterMeta);
		});
	});

	describe("UPDATE_FILE_ERROR", () => {
		it("sets error string and status to Error for matching file id", () => {
			const file = makeFile({
				id: "file-1",
				status: FileProcessingStatus.Processing,
			});
			const state = makeInitialState({ files: [file] });

			const result = appReducer(state, {
				type: "UPDATE_FILE_ERROR",
				id: "file-1",
				error: "File may be corrupted",
			});

			expect(result.files[0]!.error).toBe("File may be corrupted");
			expect(result.files[0]!.status).toBe(FileProcessingStatus.Error);
		});
	});

	describe("TOGGLE_FOLDER", () => {
		it("adds folder to collapsedFolders if absent", () => {
			const state = makeInitialState();

			const result = appReducer(state, {
				type: "TOGGLE_FOLDER",
				folder: "Camera Roll/",
			});

			expect(result.collapsedFolders.has("Camera Roll/")).toBe(true);
		});

		it("removes folder from collapsedFolders if present", () => {
			const state = makeInitialState({
				collapsedFolders: new Set(["Camera Roll/"]),
			});

			const result = appReducer(state, {
				type: "TOGGLE_FOLDER",
				folder: "Camera Roll/",
			});

			expect(result.collapsedFolders.has("Camera Roll/")).toBe(false);
		});
	});

	describe("TOGGLE_ROW_EXPANSION", () => {
		it("sets expandedRowId to given id if different", () => {
			const state = makeInitialState({ expandedRowId: null });

			const result = appReducer(state, {
				type: "TOGGLE_ROW_EXPANSION",
				id: "file-1",
			});

			expect(result.expandedRowId).toBe("file-1");
		});

		it("sets expandedRowId to null if same (toggle)", () => {
			const state = makeInitialState({ expandedRowId: "file-1" });

			const result = appReducer(state, {
				type: "TOGGLE_ROW_EXPANSION",
				id: "file-1",
			});

			expect(result.expandedRowId).toBeNull();
		});
	});

	describe("exhaustive switch", () => {
		it("throws for unknown action type", () => {
			const state = makeInitialState();
			const unknownAction = { type: "UNKNOWN_ACTION" } as unknown as AppAction;

			expect(() => appReducer(state, unknownAction)).toThrow();
		});
	});
});
