import { useState, useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { FileEntry, AppAction } from "../contexts/AppContext";
import { useAppContext } from "../contexts/AppContext";
import { FileProcessingStatus } from "../../domain";

// Processes files sequentially: read metadata -> strip -> read after -> update state.
// Uses a queue ref to handle rapid successive drops without race conditions.
export async function processFileEntries(
	entries: FileEntry[],
	dispatch: Dispatch<AppAction>,
): Promise<void> {
	window.api.files.notifyFilesAdded(entries.length);

	for (const entry of entries) {
		try {
			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: FileProcessingStatus.Reading,
			});
			const beforeMetadata = await window.api.exif.readMetadata(entry.path);
			const beforeTags = Object.keys(beforeMetadata).length;

			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: FileProcessingStatus.Processing,
			});
			await window.api.exif.removeMetadata(entry.path);

			const afterMetadata = await window.api.exif.readMetadata(entry.path);
			const afterTags = Object.keys(afterMetadata).length;

			dispatch({
				type: "UPDATE_FILE_METADATA",
				id: entry.id,
				beforeTags,
				afterTags,
				beforeMetadata,
				afterMetadata,
			});

			const finalStatus =
				beforeTags === 0
					? FileProcessingStatus.NoMetadataFound
					: FileProcessingStatus.Complete;
			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: finalStatus,
			});

			window.api.files.notifyFileProcessed();
		} catch (err) {
			dispatch({
				type: "UPDATE_FILE_ERROR",
				id: entry.id,
				error: err instanceof Error ? err.message : String(err),
			});

			window.api.files.notifyFileProcessed();
		}
	}

	window.api.files.notifyAllFilesProcessed();
}

export function useProcessFiles(): {
	processFiles: (entries: FileEntry[]) => Promise<void>;
	isProcessing: boolean;
} {
	const { dispatch } = useAppContext();
	const [isProcessing, setIsProcessing] = useState(false);
	const processingRef = useRef(false);
	const queueRef = useRef<FileEntry[]>([]);

	const processQueue = useCallback(async (): Promise<void> => {
		if (processingRef.current) return;
		processingRef.current = true;
		setIsProcessing(true);

		while (queueRef.current.length > 0) {
			const batch = [...queueRef.current];
			queueRef.current = [];
			await processFileEntries(batch, dispatch);
		}

		processingRef.current = false;
		setIsProcessing(false);
	}, [dispatch]);

	const processFiles = useCallback(
		async (entries: FileEntry[]): Promise<void> => {
			queueRef.current.push(...entries);
			await processQueue();
		},
		[processQueue],
	);

	return { processFiles, isProcessing };
}
