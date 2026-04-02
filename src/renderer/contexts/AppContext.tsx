import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { FileProcessingStatus } from "../../domain";
import { assertNever } from "../../common/types";

export type FolderDiscoveryStatus =
	| "scanning"
	| "discovering"
	| "complete"
	| "empty";

export interface FolderState {
	path: string;
	status: FolderDiscoveryStatus;
	fileCount: number;
}

export interface FileEntry {
	id: string;
	path: string;
	name: string;
	extension: string;
	size: number;
	folder: string | null;
	status: FileProcessingStatus;
	beforeTags: number | null;
	afterTags: number | null;
	beforeMetadata: Record<string, unknown> | null;
	afterMetadata: Record<string, unknown> | null;
	error: string | null;
}

export interface AppState {
	files: FileEntry[];
	collapsedFolders: Set<string>;
	expandedRowId: string | null;
	folderStates: Map<string, FolderState>;
}

export type AppAction =
	| { type: "ADD_FILES"; files: FileEntry[] }
	| { type: "CLEAR_FILES" }
	| { type: "UPDATE_FILE_STATUS"; id: string; status: FileProcessingStatus }
	| {
			type: "UPDATE_FILE_METADATA";
			id: string;
			beforeTags: number;
			afterTags: number;
			beforeMetadata: Record<string, unknown> | null;
			afterMetadata: Record<string, unknown> | null;
	  }
	| { type: "UPDATE_FILE_ERROR"; id: string; error: string }
	| { type: "TOGGLE_FOLDER"; folder: string }
	| { type: "TOGGLE_ROW_EXPANSION"; id: string }
	| { type: "ADD_FOLDER_SCANNING"; folder: string }
	| {
			type: "UPDATE_FOLDER_STATE";
			folder: string;
			status: FolderDiscoveryStatus;
			fileCount: number;
	  }
	| { type: "COLLAPSE_FOLDER"; folder: string };

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "ADD_FILES":
			return { ...state, files: [...state.files, ...action.files] };
		case "CLEAR_FILES":
			return {
				...state,
				files: [],
				collapsedFolders: new Set<string>(),
				expandedRowId: null,
				folderStates: new Map<string, FolderState>(),
			};
		case "UPDATE_FILE_STATUS":
			return {
				...state,
				files: state.files.map((file) =>
					file.id === action.id ? { ...file, status: action.status } : file,
				),
			};
		case "UPDATE_FILE_METADATA":
			return {
				...state,
				files: state.files.map((file) =>
					file.id === action.id
						? {
								...file,
								beforeTags: action.beforeTags,
								afterTags: action.afterTags,
								beforeMetadata: action.beforeMetadata,
								afterMetadata: action.afterMetadata,
							}
						: file,
				),
			};
		case "UPDATE_FILE_ERROR":
			return {
				...state,
				files: state.files.map((file) =>
					file.id === action.id
						? {
								...file,
								error: action.error,
								status: FileProcessingStatus.Error,
							}
						: file,
				),
			};
		case "TOGGLE_FOLDER": {
			const next = new Set(state.collapsedFolders);
			if (next.has(action.folder)) {
				next.delete(action.folder);
			} else {
				next.add(action.folder);
			}
			return { ...state, collapsedFolders: next };
		}
		case "TOGGLE_ROW_EXPANSION":
			return {
				...state,
				expandedRowId: state.expandedRowId === action.id ? null : action.id,
			};
		case "ADD_FOLDER_SCANNING": {
			const nextFolders = new Map(state.folderStates);
			nextFolders.set(action.folder, {
				path: action.folder,
				status: "scanning",
				fileCount: 0,
			});
			return { ...state, folderStates: nextFolders };
		}
		case "UPDATE_FOLDER_STATE": {
			const nextFolders = new Map(state.folderStates);
			nextFolders.set(action.folder, {
				path: action.folder,
				status: action.status,
				fileCount: action.fileCount,
			});
			return { ...state, folderStates: nextFolders };
		}
		case "COLLAPSE_FOLDER": {
			const nextCollapsed = new Set(state.collapsedFolders);
			nextCollapsed.add(action.folder);
			return { ...state, collapsedFolders: nextCollapsed };
		}
		default:
			return assertNever({ value: action });
	}
}

const initialState: AppState = {
	files: [],
	collapsedFolders: new Set<string>(),
	expandedRowId: null,
	folderStates: new Map<string, FolderState>(),
};

interface AppContextValue {
	state: AppState;
	dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [state, dispatch] = useReducer(appReducer, initialState);

	return (
		<AppContext.Provider value={{ state, dispatch }}>
			{children}
		</AppContext.Provider>
	);
}

export function useAppContext(): AppContextValue {
	const context = useContext(AppContext);
	if (context === null) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return context;
}
