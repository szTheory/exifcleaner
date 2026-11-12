// Shared outcome and failure fixtures (D-04, STY-05).
//
// Every case holds what the main process returns (`removeResult`), what the BEFORE
// read returns (`readMetadata`) and the dispatches `processFileEntries`
// (src/renderer/hooks/use_process_files.ts) makes after ADD_FILES, in order. `entryFor`
// folds those dispatches through the real `appReducer`, so a fixture entry can only
// be a state the reducer produces. The stories and the renderer tests import this
// one module (72-03 converts the tests; 72-05's control proves the coupling).
//
// Test support in the production source tree (V3): only *.stories.tsx files and
// story_support itself import it (the importer gate in
// .storybook/story_support_imports.test.ts), so it never reaches a bundle.
import type { RemoveMetadataResult } from "../../common/ipc_channels";
import { FileProcessingStatus } from "../../domain";
import type { FileEntry, AppAction, AppState } from "../contexts/AppContext";
import { appReducer } from "../contexts/AppContext";

export type FailureKind = NonNullable<FileEntry["failureKind"]>;

export type FailureCase = {
	name: string;
	// The BEFORE read (`window.api.exif.readMetadata` on the source path).
	readMetadata: Record<string, unknown>;
	// The main-process answer to `window.api.exif.removeMetadata`.
	removeResult: RemoveMetadataResult;
	// Dispatches after ADD_FILES, in order, for the entry id `test-id-1`.
	actions: ReadonlyArray<AppAction>;
};

// A success case also carries the AFTER read of the returned output path.
export type OutcomeCase = FailureCase & {
	afterMetadata?: Record<string, unknown>;
};

const ID = "test-id-1";
const SOURCE_PATH = "/path/to/test.jpg";
const READING: AppAction = {
	type: "UPDATE_FILE_STATUS",
	id: ID,
	status: FileProcessingStatus.Reading,
};
const PROCESSING: AppAction = {
	type: "UPDATE_FILE_STATUS",
	id: ID,
	status: FileProcessingStatus.Processing,
};

export function fileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		id: ID,
		path: SOURCE_PATH,
		name: "test.jpg",
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

export function entryFor(
	fixtureCase: FailureCase,
	overrides: Partial<FileEntry> = {},
): FileEntry {
	const entry = fileEntry(overrides);
	let state: AppState = {
		files: [],
		collapsedFolders: new Set<string>(),
		expandedRowId: null,
		folderStates: new Map(),
	};
	state = appReducer(state, { type: "ADD_FILES", files: [entry] });
	for (const action of fixtureCase.actions) {
		state = appReducer(
			state,
			"id" in action ? { ...action, id: entry.id } : action,
		);
	}
	const folded = state.files[0];
	if (folded === undefined) {
		throw new Error(`fixture case ${fixtureCase.name} produced no entry`);
	}
	return folded;
}

// The detail text FileRow.tsx hands to ErrorExpansion: `<detail>: <residualPath>` for
// the three kinds that carry a residual path, else the detail, else the error.
export function errorTextFor(entry: FileEntry): string {
	if (
		(entry.failureKind === "cleanup" ||
			entry.failureKind === "xattr" ||
			entry.failureKind === "write") &&
		entry.detail !== undefined &&
		entry.residualPath !== undefined
	) {
		return `${entry.detail}: ${entry.residualPath}`;
	}
	return entry.detail ?? entry.error ?? "";
}

// The failure the main process reports for a staged write (the strings are the ones
// transactionFailureResult in src/main/exif_handlers.ts returns).
function failure(
	kind: Exclude<FailureKind, "refused">,
	detail: string,
	residualPath?: string,
): FailureCase {
	return {
		name: kind,
		readMetadata: { Artist: "Ada" },
		removeResult: {
			success: false,
			failureKind: kind,
			detail,
			...(residualPath === undefined ? {} : { residualPath }),
		},
		actions: [
			READING,
			PROCESSING,
			{
				type: "UPDATE_FILE_ERROR",
				id: ID,
				error: detail,
				failureKind: kind,
				detail,
				...(residualPath === undefined ? {} : { residualPath }),
			},
		],
	};
}

const REFUSED_DETAIL =
	"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.";

export const FAILURE_CASES: Record<FailureKind, FailureCase> = {
	write: failure(
		"write",
		"Generated output write failed",
		"/path/to/incomplete-output.jpg",
	),
	verification: failure("verification", "Generated output verification failed"),
	cleanup: failure(
		"cleanup",
		"Generated output cleanup failed",
		"/path/to/incomplete-output.jpg",
	),
	commit: failure("commit", "Generated output commit failed"),
	xattr: failure(
		"xattr",
		"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted",
		"/path/to/cleaned.jpg",
	),
	refused: {
		name: "refused",
		readMetadata: { DateTimeOriginal: "2024:01:01 00:00:00" },
		removeResult: {
			success: false,
			failureKind: "refused",
			refusalReason: "unsafe-raf-write",
			detail: REFUSED_DETAIL,
			originalPath: "/path/to/sample.raf",
		},
		actions: [
			READING,
			PROCESSING,
			{
				type: "UPDATE_FILE_ERROR",
				id: ID,
				error: REFUSED_DETAIL,
				failureKind: "refused",
				detail: REFUSED_DETAIL,
				outcomeKind: "refused",
			},
		],
	},
};

// The kinds the code distinguishes by having no residual path (D-04 "with and
// without residualPath"): the other three carry one in FAILURE_CASES.
export const FAILURE_WITHOUT_RESIDUAL: Record<
	"write" | "cleanup" | "xattr",
	FailureCase
> = {
	write: withoutResidual(FAILURE_CASES.write),
	cleanup: withoutResidual(FAILURE_CASES.cleanup),
	xattr: withoutResidual(FAILURE_CASES.xattr),
};

function withoutResidual(source: FailureCase): FailureCase {
	const { removeResult } = source;
	if (removeResult.success || !("failureKind" in removeResult)) {
		throw new Error(`fixture case ${source.name} is not a typed failure`);
	}
	if (removeResult.failureKind === "refused") {
		throw new Error(`fixture case ${source.name} is a refusal`);
	}
	const { residualPath: _residualPath, ...rest } = removeResult;
	return {
		name: `${source.name}-without-residual`,
		readMetadata: source.readMetadata,
		removeResult: rest,
		actions: source.actions.map((action) => {
			if (action.type !== "UPDATE_FILE_ERROR") return action;
			const { residualPath: _dropped, ...kept } = action;
			return kept;
		}),
	};
}

// The `{ success: false, error }` branch (and the catch block): no failureKind, so
// the union-keyed record above cannot hold it (RESEARCH C4).
export const GENERIC_FAILURE: FailureCase = {
	name: "generic",
	readMetadata: { Artist: "Ada" },
	removeResult: {
		success: false,
		error: "ExifTool crashed unexpectedly. Restart the app to retry.",
	},
	actions: [
		READING,
		PROCESSING,
		{
			type: "UPDATE_FILE_ERROR",
			id: ID,
			error: "ExifTool crashed unexpectedly. Restart the app to retry.",
		},
	],
};

const CLEANED_OUTPUT = "/path/to/test_cleaned.jpg";

export const OUTCOME_CASES: {
	cleaned: OutcomeCase;
	unchanged: OutcomeCase;
	"already-clean": OutcomeCase;
	refused: FailureCase;
} = {
	cleaned: {
		name: "cleaned",
		readMetadata: { tag1: "v", tag2: "v", tag3: "v" },
		afterMetadata: { tag1: "v" },
		removeResult: {
			success: true,
			outputPath: CLEANED_OUTPUT,
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 512,
		},
		actions: [
			READING,
			PROCESSING,
			{
				type: "UPDATE_FILE_METADATA",
				id: ID,
				beforeTags: 3,
				afterTags: 1,
				beforeMetadata: { tag1: "v", tag2: "v", tag3: "v" },
				afterMetadata: { tag1: "v" },
				outputPath: CLEANED_OUTPUT,
				wasForcedCopy: false,
				outcomeKind: "cleaned",
				removedFields: 2,
				stillPresentFields: 1,
				wroteFile: true,
				outputSize: 512,
			},
			{
				type: "UPDATE_FILE_STATUS",
				id: ID,
				status: FileProcessingStatus.Complete,
			},
		],
	},
	unchanged: {
		name: "unchanged",
		readMetadata: { Artist: "Ada" },
		afterMetadata: { Artist: "Ada" },
		removeResult: {
			success: true,
			outputPath: SOURCE_PATH,
			wasForcedCopy: false,
			wroteFile: true,
			outputSize: 1024,
		},
		actions: [
			READING,
			PROCESSING,
			{
				type: "UPDATE_FILE_METADATA",
				id: ID,
				beforeTags: 1,
				afterTags: 1,
				beforeMetadata: { Artist: "Ada" },
				afterMetadata: { Artist: "Ada" },
				outputPath: SOURCE_PATH,
				wasForcedCopy: false,
				outcomeKind: "unchanged",
				removedFields: 0,
				stillPresentFields: 1,
				wroteFile: true,
				outputSize: 1024,
			},
			{
				type: "UPDATE_FILE_STATUS",
				id: ID,
				status: FileProcessingStatus.Complete,
			},
		],
	},
	// The `beforeTags === 0` early exit (use_process_files.ts:30-52, mirrored; the
	// hook is not touched): no write, so no removeResult is ever consulted.
	"already-clean": {
		name: "already-clean",
		readMetadata: {},
		removeResult: {
			success: true,
			outputPath: SOURCE_PATH,
			wasForcedCopy: false,
			wroteFile: false,
			outputSize: 1024,
		},
		actions: [
			READING,
			{
				type: "UPDATE_FILE_METADATA",
				id: ID,
				beforeTags: 0,
				afterTags: 0,
				beforeMetadata: {},
				afterMetadata: {},
				outputPath: SOURCE_PATH,
				wasForcedCopy: false,
				outcomeKind: "already-clean",
				removedFields: 0,
				stillPresentFields: 0,
				wroteFile: false,
			},
			{
				type: "UPDATE_FILE_STATUS",
				id: ID,
				status: FileProcessingStatus.NoMetadataFound,
			},
		],
	},
	refused: FAILURE_CASES.refused,
};
