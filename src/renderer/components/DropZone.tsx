import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../contexts/AppContext";
import type { FileEntry } from "../contexts/AppContext";
import { FileProcessingStatus, isSupportedFile } from "../../domain";
import { getFileExtension } from "../utils/get_file_extension";
import { useProcessFiles } from "../hooks/use_process_files";

function buildFileEntry(
	path: string,
	name: string,
	size: number,
	folder: string | null,
): FileEntry {
	return {
		id: crypto.randomUUID(),
		path,
		name,
		extension: getFileExtension(name),
		size,
		folder,
		status: FileProcessingStatus.Pending,
		beforeTags: null,
		afterTags: null,
		beforeMetadata: null,
		afterMetadata: null,
		error: null,
	};
}

function computeFolderLabel(folderPath: string, filePath: string): string {
	const folderBaseName =
		folderPath
			.split(/[/\\]/)
			.filter(Boolean)
			.pop() || "";
	const relativePath = filePath
		.slice(folderPath.length)
		.replace(/[/\\][^/\\]+$/, "");
	return relativePath
		? `${folderBaseName}${relativePath}/`
		: `${folderBaseName}/`;
}

export function DropZone({
	children,
	onSkipToast,
}: {
	children: ReactNode;
	onSkipToast?: (message: string) => void;
}): React.JSX.Element {
	const [isDragOver, setIsDragOver] = useState(false);
	const { dispatch } = useAppContext();
	const { processFiles } = useProcessFiles();

	const handleDragOver = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = useCallback(
		async (e: React.DragEvent): Promise<void> => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const droppedFiles = Array.from(e.dataTransfer.files);
			const allPaths = droppedFiles.map((file) =>
				window.api.files.getPathForFile(file),
			);

			// Classify paths into files and folders via IPC
			const { files: filePaths, folders: folderPaths } =
				await window.api.folder.classify(allPaths);

			// Step 1: Process loose files first (mixed drop ordering per D-07)
			const looseEntries: FileEntry[] = filePaths
				.filter((p) => isSupportedFile(p))
				.map((p) => {
					const name = window.api.files.basename(p);
					return buildFileEntry(p, name, 0, null);
				});

			if (looseEntries.length > 0) {
				dispatch({ type: "ADD_FILES", files: looseEntries });
				processFiles(looseEntries);
			}

			// Step 2: Process each folder
			for (const folderPath of folderPaths) {
				const folderBaseName =
					folderPath
						.split(/[/\\]/)
						.filter(Boolean)
						.pop() || folderPath;

				// Show scanning state immediately
				dispatch({
					type: "ADD_FOLDER_SCANNING",
					folder: folderBaseName + "/",
				});

				// Expand folder via IPC
				const result = await window.api.folder.expand(folderPath);

				if (result.error !== undefined) {
					// Folder expansion failed
					dispatch({
						type: "UPDATE_FOLDER_STATE",
						folder: folderBaseName + "/",
						status: "empty",
						fileCount: 0,
					});
					continue;
				}

				const discoveredFiles = result.files;
				const folderEntries: FileEntry[] = discoveredFiles.map(
					(filePath) => {
						const name = window.api.files.basename(filePath);
						const folderLabel = computeFolderLabel(
							folderPath,
							filePath,
						);
						return buildFileEntry(filePath, name, 0, folderLabel);
					},
				);

				if (folderEntries.length === 0) {
					// Empty folder
					dispatch({
						type: "UPDATE_FOLDER_STATE",
						folder: folderBaseName + "/",
						status: "empty",
						fileCount: 0,
					});
					// Auto-collapse after 1.5s
					setTimeout(() => {
						dispatch({
							type: "COLLAPSE_FOLDER",
							folder: folderBaseName + "/",
						});
					}, 1500);
				} else {
					// Add files and update folder state
					dispatch({ type: "ADD_FILES", files: folderEntries });
					dispatch({
						type: "UPDATE_FOLDER_STATE",
						folder: folderBaseName + "/",
						status: "complete",
						fileCount: folderEntries.length,
					});
					// Auto-start processing
					processFiles(folderEntries);
				}

				// Show toast for skipped folders
				if (result.skippedCount > 0 && onSkipToast !== undefined) {
					onSkipToast(
						`${result.skippedCount} folders couldn't be read`,
					);
				}
			}
		},
		[dispatch, processFiles, onSkipToast],
	);

	// Listen for files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((menuFilePaths) => {
			const entries = menuFilePaths
				.filter((p) => isSupportedFile(p))
				.map((p) => {
					const name = window.api.files.basename(p);
					return buildFileEntry(p, name, 0, null);
				});
			if (entries.length > 0) {
				dispatch({ type: "ADD_FILES", files: entries });
				processFiles(entries);
			}
		});
		return cleanup;
	}, [dispatch, processFiles]);

	return (
		<div
			className={`drop-zone${isDragOver ? " drop-zone--active" : ""}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			role="region"
			aria-label="File drop zone"
		>
			{children}
		</div>
	);
}
