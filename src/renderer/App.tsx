import { useState, useRef, useCallback, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { EmptyState } from "./components/EmptyState";
import { DropZone } from "./components/DropZone";
import { FileTable } from "./components/FileTable";
import { GearIcon } from "./components/GearIcon";
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

	return (
		<>
			<GearIcon
				ref={gearRef}
				isOpen={isSettingsOpen}
				onClick={() => setIsSettingsOpen((prev) => !prev)}
			/>
			<div aria-hidden={isSettingsOpen || undefined}>
				<DropZone>
					{state.files.length === 0 ? <EmptyState /> : <FileTable />}
				</DropZone>
			</div>
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
