import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../contexts/AppContext";

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
			return { path, name: window.api.files.basename(path) };
		});
		if (files.length > 0) {
			dispatch({ type: "ADD_FILES", files });
		}
	};

	// Listen for files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((filePaths) => {
			const files = filePaths.map((p) => ({
				path: p,
				name: window.api.files.basename(p),
			}));
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
