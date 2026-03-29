import { useState, useRef, useCallback, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { FileProcessingStatus } from "../domain/file_status";
import { useElapsedTime } from "./hooks/use_elapsed_time";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EmptyState } from "./components/EmptyState";
import { DropZone } from "./components/DropZone";
import { FileTable } from "./components/FileTable";
import { GearIcon } from "./components/GearIcon";
import { StatusBar } from "./components/StatusBar";
import { SettingsDrawer } from "./components/SettingsDrawer";

function AppContent(): React.JSX.Element {
	const { state } = useAppContext();
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const gearRef = useRef<HTMLButtonElement>(null);

	// Listen for settings:toggle IPC from menu/keyboard shortcut
	useEffect(() => {
		const unsubscribe = window.api.settings.onToggle(() => {
			setIsSettingsOpen((prev) => !prev);
		});
		return unsubscribe;
	}, []);

	// Return focus to gear icon on close
	const handleClose = useCallback((): void => {
		setIsSettingsOpen(false);
		// Defer focus return to after animation
		setTimeout(() => gearRef.current?.focus(), 0);
	}, []);

	const hasFiles = state.files.length > 0;

	// Compute file stats for status bar
	const totalCount = state.files.length;
	const completedCount = state.files.filter(
		(f) =>
			f.status === FileProcessingStatus.Complete ||
			f.status === FileProcessingStatus.NoMetadataFound ||
			f.status === FileProcessingStatus.Error,
	).length;
	const totalTagsRemoved = state.files.reduce((sum, f) => {
		if (
			(f.status === FileProcessingStatus.Complete ||
				f.status === FileProcessingStatus.NoMetadataFound) &&
			f.beforeTags !== null &&
			f.afterTags !== null
		) {
			return sum + (f.beforeTags - f.afterTags);
		}
		return sum;
	}, 0);
	const allDone =
		totalCount > 0 &&
		state.files.every(
			(f) =>
				f.status === FileProcessingStatus.Complete ||
				f.status === FileProcessingStatus.Error ||
				f.status === FileProcessingStatus.NoMetadataFound,
		);

	const { elapsedSeconds, startTimer, stopTimer, resetTimer } =
		useElapsedTime();

	useEffect(() => {
		if (totalCount > 0 && !allDone) {
			startTimer();
		} else if (allDone) {
			stopTimer();
		}
	}, [totalCount, allDone, startTimer, stopTimer]);

	useEffect(() => {
		if (totalCount === 0) {
			resetTimer();
		}
	}, [totalCount, resetTimer]);

	const gearIcon = (
		<GearIcon
			ref={gearRef}
			isOpen={isSettingsOpen}
			onClick={() => setIsSettingsOpen((prev) => !prev)}
		/>
	);

	return (
		<>
			<div className="app__content" aria-hidden={isSettingsOpen || undefined}>
				<DropZone>
					{hasFiles ? <FileTable /> : <EmptyState />}
				</DropZone>
			</div>
			<StatusBar
				gearIcon={gearIcon}
				completedCount={hasFiles ? completedCount : undefined}
				totalCount={hasFiles ? totalCount : undefined}
				totalTagsRemoved={hasFiles ? totalTagsRemoved : undefined}
				elapsedSeconds={hasFiles ? elapsedSeconds : undefined}
				onCleanMore={
					hasFiles
						? () => dispatch({ type: "CLEAR_FILES" })
						: undefined
				}
			/>
			<SettingsDrawer isOpen={isSettingsOpen} onClose={handleClose} />
		</>
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
