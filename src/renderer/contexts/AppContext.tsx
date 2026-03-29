import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { FileProcessingStatus } from "../../domain/file_status";

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
	error: string | null;
}

export interface AppState {
	files: FileEntry[];
	collapsedFolders: Set<string>;
	expandedRowId: string | null;
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
	  }
	| { type: "UPDATE_FILE_ERROR"; id: string; error: string }
	| { type: "TOGGLE_FOLDER"; folder: string }
	| { type: "TOGGLE_ROW_EXPANSION"; id: string };

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
		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
		}
	}
}

const initialState: AppState = {
	files: [],
	collapsedFolders: new Set<string>(),
	expandedRowId: null,
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
