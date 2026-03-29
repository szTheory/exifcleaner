// Main orchestrating component: renders 5-column file table with folder groups
// and toast notification. Status bar is rendered by App.tsx.

import { useCallback, useRef, useState, useEffect } from "react";
import { useAppContext } from "../contexts/AppContext";
import type { FileEntry } from "../contexts/AppContext";
import { FileRow } from "./FileRow";
import { FolderRow } from "./FolderRow";
import { Toast } from "./Toast";

export function FileTable(): React.JSX.Element {
	const { state, dispatch } = useAppContext();
	const animatedCheckRef = useRef(new Set<string>());

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

	// Derive folder groups from files
	const { folderGroups, ungroupedFiles } = groupFilesByFolder(state.files);

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
						/>
					);
				})}
				{/* Folder groups */}
				{folderGroups.map(({ folder, files }) => {
					const isCollapsed = isFolderCollapsed(folder, state.collapsedFolders);
					return (
						<div key={folder}>
							<FolderRow
								folder={folder}
								fileCount={files.length}
								isCollapsed={isCollapsed}
								onToggle={() => dispatch({ type: "TOGGLE_FOLDER", folder })}
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

function groupFilesByFolder(files: FileEntry[]): {
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

	const folderGroups: FolderGroup[] = [];
	for (const [folder, groupFiles] of folderMap) {
		folderGroups.push({ folder, files: groupFiles });
	}

	return { folderGroups, ungroupedFiles };
}

/** Check if a folder is collapsed, including hierarchical prefix matching. */
function isFolderCollapsed(
	folder: string,
	collapsedFolders: Set<string>,
): boolean {
	if (collapsedFolders.has(folder)) return true;
	// Hierarchical collapse: if any parent folder is collapsed, children are hidden
	for (const collapsed of collapsedFolders) {
		if (folder.startsWith(collapsed)) return true;
	}
	return false;
}
