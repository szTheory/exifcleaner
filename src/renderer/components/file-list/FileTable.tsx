// Main orchestrating component: renders 5-column file table with folder groups
// and toast notification. Status bar is rendered by App.tsx.

import { useCallback, useRef, useState, useEffect } from "react";
import { useAppContext } from "../../contexts/AppContext";
import type { FileEntry, FolderDiscoveryStatus } from "../../contexts/AppContext";
import { FileRow } from "./FileRow";
import { FolderRow } from "./FolderRow";
import { Toast } from "../ui/Toast";

export function FileTable(): React.JSX.Element {
	const { state, dispatch } = useAppContext();
	const animatedCheckRef = useRef(new Set<string>());
	const [saveAsCopy, setSaveAsCopy] = useState(false);

	// Load saveAsCopy setting and listen for changes
	useEffect(() => {
		window.api.settings.get().then((s) => setSaveAsCopy(s.saveAsCopy));
		const unsub = window.api.settings.onChanged((s) =>
			setSaveAsCopy(s.saveAsCopy),
		);
		return unsub;
	}, []);

	// Toast state for copy confirmation
	const [toastVisible, setToastVisible] = useState(false);
	const [toastMessage, setToastMessage] = useState("");
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function showToast(message: string): void {
		if (toastTimerRef.current !== null) {
			clearTimeout(toastTimerRef.current);
		}
		setToastMessage(message);
		setToastVisible(true);
		toastTimerRef.current = setTimeout(() => {
			setToastVisible(false);
			toastTimerRef.current = null;
		}, 2000);
	}

	// Clean up toast timer on unmount
	useEffect(() => {
		return () => {
			if (toastTimerRef.current !== null) {
				clearTimeout(toastTimerRef.current);
			}
		};
	}, []);

	const handleCopyToast = useCallback(() => {
		showToast("Copied to clipboard");
	}, []);

	const handleRevealError = useCallback((message: string) => {
		showToast(message);
	}, []);

	// Derive folder groups from files, including folders in scanning state with no files yet
	const { folderGroups, ungroupedFiles } = groupFilesByFolder(
		state.files,
		state.folderStates,
	);

	// Build a global stagger index across all visible rows
	let staggerIndex = 0;

	return (
		<section className="file-table" role="table" aria-label="File list">
			<div className="file-table__header" role="row">
				<div className="file-table__header-cell" />
				<div className="file-table__header-cell">NAME</div>
				<div className="file-table__header-cell">TYPE</div>
				<div className="file-table__header-cell">SIZE</div>
				<div className="file-table__header-cell">BEFORE</div>
				<div className="file-table__header-cell">AFTER</div>
			</div>
			<div className="file-table__body">
				{/* Ungrouped files (folder === null) render first */}
				{ungroupedFiles.map((file) => {
					const idx = staggerIndex++;
					return (
						<FileRow
							key={file.id}
							file={file}
							isExpanded={state.expandedRowId === file.id}
							onToggleExpand={() =>
								dispatch({ type: "TOGGLE_ROW_EXPANSION", id: file.id })
							}
							staggerIndex={idx}
							animatedCheckRef={animatedCheckRef}
							onCopyToast={handleCopyToast}
							saveAsCopy={saveAsCopy}
							onRevealError={handleRevealError}
						/>
					);
				})}
				{/* Folder groups */}
				{folderGroups.map(({ folder, files }) => {
					const isDirectlyCollapsed = state.collapsedFolders.has(folder);
					const isParentCollapsed = isCollapsedByParent(folder, state.collapsedFolders);
					// Hide entire subfolder group when a parent folder is collapsed
					if (isParentCollapsed) return null;
					const isCollapsed = isDirectlyCollapsed;
					const folderState = state.folderStates.get(folder);
					const discoveryStatus: FolderDiscoveryStatus =
						folderState !== undefined ? folderState.status : "complete";
					const displayCount =
						folderState !== undefined ? folderState.fileCount : files.length;
					return (
						<div key={folder}>
							<FolderRow
								folder={folder}
								fileCount={displayCount}
								isCollapsed={isCollapsed}
								onToggle={() => dispatch({ type: "TOGGLE_FOLDER", folder })}
								discoveryStatus={discoveryStatus}
							/>
							{!isCollapsed &&
								files.map((file) => {
									const idx = staggerIndex++;
									return (
										<FileRow
											key={file.id}
											file={file}
											isExpanded={state.expandedRowId === file.id}
											onToggleExpand={() =>
												dispatch({
													type: "TOGGLE_ROW_EXPANSION",
													id: file.id,
												})
											}
											staggerIndex={idx}
											animatedCheckRef={animatedCheckRef}
											onCopyToast={handleCopyToast}
											saveAsCopy={saveAsCopy}
											onRevealError={handleRevealError}
										/>
									);
								})}
						</div>
					);
				})}
			</div>
			<Toast message={toastMessage} visible={toastVisible} />
		</section>
	);
}

interface FolderGroup {
	folder: string;
	files: FileEntry[];
}

function groupFilesByFolder(
	files: FileEntry[],
	folderStates: Map<string, { path: string; status: string; fileCount: number }>,
): {
	folderGroups: FolderGroup[];
	ungroupedFiles: FileEntry[];
} {
	const ungroupedFiles: FileEntry[] = [];
	const folderMap = new Map<string, FileEntry[]>();

	for (const file of files) {
		if (file.folder === null) {
			ungroupedFiles.push(file);
		} else {
			const existing = folderMap.get(file.folder);
			if (existing !== undefined) {
				existing.push(file);
			} else {
				folderMap.set(file.folder, [file]);
			}
		}
	}

	// Include folders from folderStates that have no files yet (scanning state)
	for (const [folderKey] of folderStates) {
		if (!folderMap.has(folderKey)) {
			folderMap.set(folderKey, []);
		}
	}

	const folderGroups: FolderGroup[] = [];
	for (const [folder, groupFiles] of folderMap) {
		folderGroups.push({ folder, files: groupFiles });
	}

	return { folderGroups, ungroupedFiles };
}

/** Check if a folder's parent is collapsed (not itself, but an ancestor). */
function isCollapsedByParent(
	folder: string,
	collapsedFolders: Set<string>,
): boolean {
	for (const collapsed of collapsedFolders) {
		if (folder !== collapsed && folder.startsWith(collapsed)) return true;
	}
	return false;
}
