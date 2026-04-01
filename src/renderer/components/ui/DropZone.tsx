import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../../contexts/AppContext";
import type { FileEntry, AppAction } from "../../contexts/AppContext";
import { FileProcessingStatus, isSupportedFile } from "../../../domain";
import { getFileExtension } from "../../utils/get_file_extension";
import { useProcessFiles } from "../../hooks/use_process_files";

const FOLDER_AUTO_COLLAPSE_DELAY_MS = 1500;

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
		extension: getFileExtension({ filename: name }),
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
	const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || "";
	const relativePath = filePath
		.slice(folderPath.length)
		.replace(/[/\\][^/\\]+$/, "");
	return relativePath
		? `${folderBaseName}${relativePath}/`
		: `${folderBaseName}/`;
}

function buildLooseEntries(filePaths: string[]): FileEntry[] {
	return filePaths
		.filter((p) => isSupportedFile({ filename: p }))
		.map((p) => {
			const name = window.api.files.basename(p);
			return buildFileEntry(p, name, 0, null);
		});
}

async function expandAndProcessFolder({
	folderPath,
	dispatch,
	processFiles,
	onSkipToast,
}: {
	folderPath: string;
	dispatch: (action: AppAction) => void;
	processFiles: (files: FileEntry[]) => void;
	onSkipToast?: ((message: string) => void) | undefined;
}): Promise<void> {
	const folderBaseName =
		folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
	const folderLabel = folderBaseName + "/";

	dispatch({ type: "ADD_FOLDER_SCANNING", folder: folderLabel });

	const result = await window.api.folder.expand(folderPath);

	if (result.error !== undefined) {
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "empty",
			fileCount: 0,
		});
		return;
	}

	const folderEntries: FileEntry[] = result.files.map((filePath) => {
		const name = window.api.files.basename(filePath);
		return buildFileEntry(filePath, name, 0, computeFolderLabel(folderPath, filePath));
	});

	if (folderEntries.length === 0) {
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "empty",
			fileCount: 0,
		});
		setTimeout(() => {
			dispatch({ type: "COLLAPSE_FOLDER", folder: folderLabel });
		}, FOLDER_AUTO_COLLAPSE_DELAY_MS);
	} else {
		dispatch({ type: "ADD_FILES", files: folderEntries });
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "complete",
			fileCount: folderEntries.length,
		});
		processFiles(folderEntries);
	}

	if (result.skippedCount > 0 && onSkipToast !== undefined) {
		onSkipToast(`${result.skippedCount} folders couldn't be read`);
	}
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

			const { files: filePaths, folders: folderPaths } =
				await window.api.folder.classify(allPaths);

			// Loose files first (mixed drop ordering per D-07)
			const looseEntries = buildLooseEntries(filePaths);
			if (looseEntries.length > 0) {
				dispatch({ type: "ADD_FILES", files: looseEntries });
				processFiles(looseEntries);
			}

			for (const folderPath of folderPaths) {
				await expandAndProcessFolder({
					folderPath,
					dispatch,
					processFiles,
					onSkipToast,
				});
			}
		},
		[dispatch, processFiles, onSkipToast],
	);

	// Files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((menuFilePaths) => {
			const entries = menuFilePaths
				.filter((p) => isSupportedFile({ filename: p }))
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
