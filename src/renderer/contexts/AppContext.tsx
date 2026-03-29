import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";

export interface FileEntry {
	path: string;
	name: string;
}

export interface AppState {
	files: FileEntry[];
}

export type AppAction =
	| { type: "ADD_FILES"; files: FileEntry[] }
	| { type: "CLEAR_FILES" };

function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "ADD_FILES":
			return { ...state, files: [...state.files, ...action.files] };
		case "CLEAR_FILES":
			return { ...state, files: [] };
		default: {
			const _exhaustive: never = action;
			throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
		}
	}
}

const initialState: AppState = {
	files: [],
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
