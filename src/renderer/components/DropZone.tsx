import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../contexts/AppContext";
import type { FileEntry } from "../contexts/AppContext";
import { FileProcessingStatus } from "../../domain/file_status";
import { isSupportedFile } from "../../domain/file_types";
import { getFileExtension } from "../utils/get_file_extension";
import { useProcessFiles } from "../hooks/use_process_files";

function buildFileEntry(path: string, name: string, size: number): FileEntry {
	return {
		id: crypto.randomUUID(),
		path,
		name,
		extension: getFileExtension(name),
		size,
		folder: null,
		status: FileProcessingStatus.Pending,
		beforeTags: null,
		afterTags: null,
		beforeMetadata: null,
		afterMetadata: null,
		error: null,
	};
}

export function DropZone({
	children,
}: {
	children: ReactNode;
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

	const handleDrop = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
		const droppedFiles = Array.from(e.dataTransfer.files);
		const entries: FileEntry[] = droppedFiles
			.filter((file) => isSupportedFile(file.name))
			.map((file) => {
				const path = window.api.files.getPathForFile(file);
				const name = window.api.files.basename(path);
				return buildFileEntry(path, name, file.size);
			});
		if (entries.length > 0) {
			dispatch({ type: "ADD_FILES", files: entries });
			processFiles(entries);
		}
	};

	// Listen for files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((filePaths) => {
			const entries = filePaths
				.filter((p) => isSupportedFile(p))
				.map((p) => {
					const name = window.api.files.basename(p);
					// File size not available from menu path; use 0 as fallback
					return buildFileEntry(p, name, 0);
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
