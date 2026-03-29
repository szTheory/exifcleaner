import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EmptyState } from "./components/EmptyState";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";

function AppContent(): React.JSX.Element {
	const { state } = useAppContext();

	return (
		<DropZone>
			{state.files.length === 0 ? (
				<EmptyState />
			) : (
				<FileList files={state.files} />
			)}
		</DropZone>
	);
}

export function App(): React.JSX.Element {
	return (
		<ThemeProvider>
			<I18nProvider>
				<AppProvider>
					<ErrorBoundary>
						<main className="app" role="main">
							<AppContent />
						</main>
					</ErrorBoundary>
				</AppProvider>
			</I18nProvider>
		</ThemeProvider>
	);
}
