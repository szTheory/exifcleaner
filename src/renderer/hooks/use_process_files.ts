import { useState, useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { FileEntry, AppAction } from "../contexts/AppContext";
import { useAppContext } from "../contexts/AppContext";
import {
	classifyMetadataOutcome,
	FileProcessingStatus,
	summarizeMetadataChange,
} from "../../domain";

// Processes files sequentially: read metadata -> strip -> read after -> update state.
// Uses a queue ref to handle rapid successive drops without race conditions.
export async function processFileEntries(
	entries: FileEntry[],
	dispatch: Dispatch<AppAction>,
): Promise<void> {
	window.api.files.notifyFilesAdded(entries.length);
	const settings = await window.api.settings.get();

	for (const entry of entries) {
		try {
			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: FileProcessingStatus.Reading,
			});
			const beforeMetadata = await window.api.exif.readMetadata(entry.path);
			const beforeTags = Object.keys(beforeMetadata).length;

			if (beforeTags === 0 && !settings.removeXattrs) {
				dispatch({
					type: "UPDATE_FILE_METADATA",
					id: entry.id,
					beforeTags: 0,
					afterTags: 0,
					beforeMetadata,
					afterMetadata: beforeMetadata,
					outputPath: entry.path,
					wasForcedCopy: false,
					outcomeKind: "already-clean",
					removedFields: 0,
					stillPresentFields: 0,
					wroteFile: false,
				});
				dispatch({
					type: "UPDATE_FILE_STATUS",
					id: entry.id,
					status: FileProcessingStatus.NoMetadataFound,
				});
				window.api.files.notifyFileProcessed();
				continue;
			}

			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: FileProcessingStatus.Processing,
			});
			const removeResult = await window.api.exif.removeMetadata(entry.path);

			if (!removeResult.success) {
				if ("error" in removeResult) {
					dispatch({
						type: "UPDATE_FILE_ERROR",
						id: entry.id,
						error: removeResult.error,
					});
				} else {
					switch (removeResult.failureKind) {
						case "refused":
							dispatch({
								type: "UPDATE_FILE_ERROR",
								id: entry.id,
								error: removeResult.detail,
								failureKind: "refused",
								detail: removeResult.detail,
								outcomeKind: "refused",
							});
							break;
						case "write":
						case "verification":
						case "cleanup":
						case "commit":
						case "xattr":
							dispatch({
								type: "UPDATE_FILE_ERROR",
								id: entry.id,
								error: removeResult.detail,
								failureKind: removeResult.failureKind,
								detail: removeResult.detail,
								...(removeResult.residualPath === undefined
									? {}
									: { residualPath: removeResult.residualPath }),
							});
							break;
					}
				}
				window.api.files.notifyFileProcessed();
				continue;
			}

			const afterMetadata = await window.api.exif.readMetadata(
				removeResult.outputPath,
			);
			const summary = summarizeMetadataChange({
				before: beforeMetadata,
				after: afterMetadata,
			});
			const outcomeKind = classifyMetadataOutcome(summary);

			dispatch({
				type: "UPDATE_FILE_METADATA",
				id: entry.id,
				beforeTags: summary.beforeCount,
				afterTags: summary.afterCount,
				beforeMetadata,
				afterMetadata,
				outputPath: removeResult.outputPath,
				wasForcedCopy: removeResult.wasForcedCopy,
				outcomeKind,
				removedFields: summary.removedCount,
				stillPresentFields: summary.stillPresentCount,
				wroteFile: removeResult.wroteFile ?? true,
				outputSize: removeResult.outputSize,
			});

			const finalStatus =
				outcomeKind === "already-clean"
					? FileProcessingStatus.NoMetadataFound
					: FileProcessingStatus.Complete;
			dispatch({
				type: "UPDATE_FILE_STATUS",
				id: entry.id,
				status: finalStatus,
			});

			window.api.files.notifyFileProcessed();
		} catch (err: unknown) {
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
