import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../contexts/AppContext";
import type { FileEntry } from "../contexts/AppContext";
import { FileProcessingStatus } from "../../domain/file_status";

function getFileExtension(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot === -1 || lastDot === filename.length - 1) return "";
	return filename.substring(lastDot + 1).toUpperCase();
}

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
		const files = droppedFiles.map((file) => {
			const path = window.api.files.getPathForFile(file);
			const name = window.api.files.basename(path);
			return buildFileEntry(path, name, file.size);
		});
		if (files.length > 0) {
			dispatch({ type: "ADD_FILES", files });
		}
	};

	// Listen for files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((filePaths) => {
			const files = filePaths.map((p) => {
				const name = window.api.files.basename(p);
				// File size not available from menu path; use 0 as fallback
				return buildFileEntry(p, name, 0);
			});
			if (files.length > 0) {
				dispatch({ type: "ADD_FILES", files });
			}
		});
		return cleanup;
	}, [dispatch]);

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
