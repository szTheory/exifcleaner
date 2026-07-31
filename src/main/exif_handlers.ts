import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";
import { generateCleanedPath } from "../domain/files/cleaned_path";
import { isRawFile, isVideoFile } from "../domain/files/file_types";
import type { OutputTransactionFailure } from "./output_transaction";

export function setupExifHandlers({
	container,
}: {
	container: Container;
}): void {
	ipcMain.handle(
		"exif:read",
		createValidatedHandler(exifReadSchema, async (filePath) => {
			const result = await container.readMetadata.execute({ filePath });
			if (result.ok) {
				return result.value;
			}
			return {};
		}),
	);

	ipcMain.handle(
		"exif:remove",
		createValidatedHandler(exifRemoveSchema, async (filePath) => {
			const settings = container.settings.get();
			const isRaw = isRawFile({ filename: filePath });
			const isVideo = isVideoFile({ filename: filePath });
			const wasForcedCopy = isRaw && !settings.saveAsCopy;
			const saveAsCopy = settings.saveAsCopy || wasForcedCopy;
			const outputPath = saveAsCopy
				? generateCleanedPath({ filePath, exists: existsSync })
				: undefined;

			if (isRaw || isVideo) {
				const generatedPath =
					outputPath ?? generateVideoStagePath({ filePath });
				const transactionResult = await container.outputTransaction.execute({
					filePath,
					generatedPath,
					commitPath: outputPath === undefined ? filePath : undefined,
					preserveOrientation: settings.preserveOrientation,
					preserveColorProfile: settings.preserveColorProfile,
					preserveTimestamps: settings.preserveTimestamps,
				});
				if (transactionResult.ok) {
					return {
						success: true,
						outputPath: transactionResult.value.outputPath,
						wasForcedCopy,
					};
				}
				return transactionFailureResult(transactionResult.error);
			}

			const result = await container.stripMetadata.execute({
				filePath,
				preserveOrientation: settings.preserveOrientation,
				preserveColorProfile: settings.preserveColorProfile,
				preserveTimestamps: settings.preserveTimestamps,
				saveAsCopy,
				outputPath,
			});
			if (result.ok) {
				return {
					success: true,
					outputPath: outputPath ?? filePath,
					wasForcedCopy,
				};
			}
			return { success: false, error: formatExifError(result.error) };
		}),
	);
}

function generateVideoStagePath({ filePath }: { filePath: string }): string {
	const parsedPath = parse(filePath);
	return join(
		dirname(filePath),
		`.${parsedPath.name}.exifcleaner-stage-${randomUUID()}${parsedPath.ext}`,
	);
}

function transactionFailureResult(error: OutputTransactionFailure): {
	success: false;
	failureKind: "write" | "verification" | "cleanup" | "commit";
	detail: string;
	residualPath?: string;
} {
	switch (error.code) {
		case "write-failed":
			return {
				success: false,
				failureKind: "write",
				detail: "Generated output write failed",
			};
		case "verification-failed":
			return {
				success: false,
				failureKind: "verification",
				detail: "Generated output verification failed",
			};
		case "cleanup-failed":
			return {
				success: false,
				failureKind: "cleanup",
				detail: "Generated output cleanup failed",
				residualPath: error.residualPath,
			};
		case "commit-failed":
			return {
				success: false,
				failureKind: "commit",
				detail: "Generated output commit failed",
			};
	}
}
