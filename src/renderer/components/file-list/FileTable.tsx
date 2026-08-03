// Main orchestrating component: renders 5-column file table with folder groups
// and toast notification. Status bar is rendered by App.tsx.

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../contexts/AppContext";
import { FileProcessingStatus } from "../../../domain";
import { assertNever } from "../../../common/types";
import type {
	FileEntry,
	FolderDiscoveryStatus,
} from "../../contexts/AppContext";
import { FileRow } from "./FileRow";
import { FolderRow } from "./FolderRow";
import { Toast } from "../ui/Toast";
import { useI18n } from "../../hooks/use_i18n";

const TOAST_AUTO_HIDE_DELAY_MS = 2000;

export type SortKey = "name" | "type" | "size" | "before" | "after";
export type SortDirection = "ascending" | "descending";

export function FileTable(): React.JSX.Element {
	const { state, dispatch } = useAppContext();
	const { t } = useI18n();
	const animatedCheckRef = useRef(new Set<string>());
	const [sort, setSort] = useState<{
		key: SortKey;
		direction: SortDirection;
	} | null>(null);

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
		}, TOAST_AUTO_HIDE_DELAY_MS);
	}

	useEffect(() => {
		return () => {
			if (toastTimerRef.current !== null) {
				clearTimeout(toastTimerRef.current);
			}
		};
	}, []);

	const handleCopyToast = useCallback(() => {
		showToast(t("toast.copied"));
	}, [t]);

	const handleRevealError = useCallback((message: string) => {
		showToast(message);
	}, []);

	const { folderGroups, ungroupedFiles } = useMemo(
		() => groupFilesByFolder(state.files, state.folderStates, sort),
		[state.files, state.folderStates, sort],
	);

	function toggleSort(key: SortKey): void {
		setSort((current) => ({
			key,
			direction:
				current?.key === key && current.direction === "ascending"
					? "descending"
					: "ascending",
		}));
	}

	function renderHeader(label: string, key: SortKey): React.JSX.Element {
		const isActive = sort?.key === key;
		const sortDescription = isActive
			? t(
					sort.direction === "ascending"
						? "table.sort.ascending"
						: "table.sort.descending",
				)
			: null;
		return (
			<div
				className="file-table__header-cell"
				role="columnheader"
				aria-sort={isActive ? sort.direction : "none"}
			>
				<button
					className="file-table__sort-button"
					type="button"
					onClick={() => toggleSort(key)}
					aria-label={
						sortDescription === null ? label : `${label}. ${sortDescription}`
					}
				>
					{label}
					{isActive && (
						<span aria-hidden="true">
							{sort.direction === "ascending" ? " ↑" : " ↓"}
						</span>
					)}
				</button>
			</div>
		);
	}

	let staggerIndex = 0;

	return (
		<section className="file-table" role="table" aria-label={t("table.label")}>
			<div className="file-table__header" role="row">
				<div className="file-table__header-cell" role="columnheader" />
				{renderHeader(t("table.header.name"), "name")}
				{renderHeader(t("table.header.type"), "type")}
				{renderHeader(t("table.header.size"), "size")}
				{renderHeader(t("table.header.before"), "before")}
				{renderHeader(t("table.header.after"), "after")}
			</div>
			<div className="file-table__body" role="rowgroup">
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
							onRevealError={handleRevealError}
						/>
					);
				})}
				{folderGroups.map(({ folder, files }) => {
					const isDirectlyCollapsed = state.collapsedFolders.has(folder);
					const isParentCollapsed = isCollapsedByParent(
						folder,
						state.collapsedFolders,
					);
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
	folderStates: Map<
		string,
		{ path: string; status: string; fileCount: number }
	>,
	sort: { key: SortKey; direction: SortDirection } | null,
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

	for (const [folderKey] of folderStates) {
		if (!folderMap.has(folderKey)) {
			folderMap.set(folderKey, []);
		}
	}

	const folderGroups: FolderGroup[] = [];
	for (const [folder, groupFiles] of folderMap) {
		folderGroups.push({ folder, files: sortFiles(groupFiles, sort) });
	}

	return { folderGroups, ungroupedFiles: sortFiles(ungroupedFiles, sort) };
}

const naturalNameCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

export function sortFiles(
	files: FileEntry[],
	sort: { key: SortKey; direction: SortDirection } | null,
): FileEntry[] {
	if (sort === null) return files;

	return files
		.map((file, index) => ({ file, index }))
		.sort((left, right) => {
			const terminalOrder = compareTerminalState(left.file, right.file);
			if (terminalOrder !== 0) return terminalOrder;

			const valueOrder = compareSortValue(left.file, right.file, sort.key);
			if (valueOrder !== 0) {
				return sort.direction === "ascending" ? valueOrder : -valueOrder;
			}
			return left.index - right.index;
		})
		.map(({ file }) => file);
}

function compareTerminalState(left: FileEntry, right: FileEntry): number {
	const rank = (file: FileEntry): number => {
		switch (file.status) {
			case FileProcessingStatus.Complete:
			case FileProcessingStatus.NoMetadataFound:
				return 0;
			case FileProcessingStatus.Pending:
			case FileProcessingStatus.Reading:
			case FileProcessingStatus.Processing:
				return 1;
			case FileProcessingStatus.Error:
				return 2;
			default:
				return assertNever({ value: file.status });
		}
	};
	return rank(left) - rank(right);
}

function compareSortValue(
	left: FileEntry,
	right: FileEntry,
	key: SortKey,
): number {
	switch (key) {
		case "name":
			return naturalNameCollator.compare(left.name, right.name);
		case "type":
			return naturalNameCollator.compare(
				left.extension.toLowerCase(),
				right.extension.toLowerCase(),
			);
		case "size":
			return left.size - right.size;
		case "before":
			return (left.beforeTags ?? -1) - (right.beforeTags ?? -1);
		case "after":
			return (left.afterTags ?? -1) - (right.afterTags ?? -1);
	}
}

function isCollapsedByParent(
	folder: string,
	collapsedFolders: Set<string>,
): boolean {
	for (const collapsed of collapsedFolders) {
		if (folder !== collapsed && folder.startsWith(collapsed)) return true;
	}
	return false;
}
