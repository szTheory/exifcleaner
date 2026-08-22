import { app, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";
import { generateCleanedPath } from "../domain/files/cleaned_path";
import { isMediaFile, isRafFile, isRawFile } from "../domain/files/file_types";
import { refuseUnsafeRafWrite } from "../domain/files/file_processing_outcome";
import type { OutputTransactionFailure } from "./output_transaction";

const DEV_XATTR_FAILURE_EVENT = "exifcleaner:dev-xattr-failure-path";

let devXattrFailurePath: string | undefined;
let devXattrFailureListener: ((filePath: unknown) => void) | undefined;

interface DevXattrFailureEventEmitter {
	on(event: string, listener: (filePath: unknown) => void): unknown;
	removeListener(event: string, listener: (filePath: unknown) => void): unknown;
}

export function setupExifHandlers({
	container,
}: {
	container: Container;
}): void {
	setupDevXattrFailureBridge();

	ipcMain.handle(
		"exif:read",
		createValidatedHandler(exifReadSchema, async (filePath) => {
			const result = await container.readMetadata.execute({ filePath });
			if (result.ok) {
				return result.value;
			}
			throw new Error(formatExifError(result.error));
		}),
	);

	ipcMain.handle(
		"exif:remove",
		createValidatedHandler(exifRemoveSchema, async (filePath) => {
			const settings = container.settings.get();
			if (isRafFile({ filename: filePath })) {
				return refuseUnsafeRafWrite({ filePath });
			}
			if (settings.removeXattrs && !settings.saveAsCopy) {
				const metadataResult = await container.readMetadata.execute({
					filePath,
				});
				if (
					metadataResult.ok &&
					Object.keys(metadataResult.value).length === 0
				) {
					return applyXattrPostcondition({
						container,
						actualOutputPath: filePath,
						wasForcedCopy: false,
						removeXattrs: true,
						wroteFile: false,
					});
				}
			}
			const isRaw = isRawFile({ filename: filePath });
			const isMedia = isMediaFile({ filename: filePath });
			const wasForcedCopy = isRaw && !settings.saveAsCopy;
			const saveAsCopy = settings.saveAsCopy || wasForcedCopy;
			const outputPath = saveAsCopy
				? generateCleanedPath({ filePath, exists: existsSync })
				: undefined;

			if (isRaw || isMedia) {
				const generatedPath =
					outputPath ?? generateMediaStagePath({ filePath });
				const transactionResult = await container.outputTransaction.execute({
					filePath,
					generatedPath,
					commitPath: outputPath === undefined ? filePath : undefined,
					preserveOrientation: settings.preserveOrientation,
					preserveColorProfile: settings.preserveColorProfile,
					preserveTimestamps: settings.preserveTimestamps,
				});
				if (transactionResult.ok) {
					return applyXattrPostcondition({
						container,
						actualOutputPath: transactionResult.value.outputPath,
						wasForcedCopy,
						removeXattrs: settings.removeXattrs,
					});
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
				return applyXattrPostcondition({
					container,
					actualOutputPath: outputPath ?? filePath,
					wasForcedCopy,
					removeXattrs: settings.removeXattrs,
				});
			}
			return { success: false, error: formatExifError(result.error) };
		}),
	);
}

async function applyXattrPostcondition({
	container,
	actualOutputPath,
	wasForcedCopy,
	removeXattrs,
	wroteFile = true,
}: {
	container: Container;
	actualOutputPath: string;
	wasForcedCopy: boolean;
	removeXattrs: boolean;
	wroteFile?: boolean;
}) {
	if (!removeXattrs) {
		const outputSize = (await stat(actualOutputPath)).size;
		return {
			success: true as const,
			outputPath: actualOutputPath,
			wasForcedCopy,
			wroteFile,
			outputSize,
		};
	}

	if (devXattrFailurePath === actualOutputPath) {
		devXattrFailurePath = undefined;
		return xattrFailureResult({
			actualOutputPath,
			error: new Error("deterministic development failure"),
		});
	}

	try {
		await container.removeXattrCommand.execute({ filePath: actualOutputPath });
	} catch (error) {
		return xattrFailureResult({ actualOutputPath, error });
	}

	const outputSize = (await stat(actualOutputPath)).size;
	return {
		success: true as const,
		outputPath: actualOutputPath,
		wasForcedCopy,
		wroteFile,
		outputSize,
	};
}

function setupDevXattrFailureBridge(): void {
	const eventEmitter = app as unknown as DevXattrFailureEventEmitter;
	devXattrFailurePath = undefined;
	if (devXattrFailureListener !== undefined) {
		eventEmitter.removeListener(
			DEV_XATTR_FAILURE_EVENT,
			devXattrFailureListener,
		);
		devXattrFailureListener = undefined;
	}

	if (app.isPackaged !== false || process.env.NODE_ENV !== "development") {
		return;
	}

	devXattrFailureListener = (filePath: unknown): void => {
		if (typeof filePath === "string") {
			devXattrFailurePath = filePath;
		}
	};
	eventEmitter.on(DEV_XATTR_FAILURE_EVENT, devXattrFailureListener);
}

function xattrFailureResult({
	actualOutputPath,
	error,
}: {
	actualOutputPath: string;
	error: unknown;
}) {
	const reason = error instanceof Error ? error.message : String(error);
	return {
		success: false as const,
		failureKind: "xattr" as const,
		detail: `Embedded metadata was removed, but macOS extended attributes could not be cleared: ${reason}`,
		residualPath: actualOutputPath,
	};
}

function generateMediaStagePath({ filePath }: { filePath: string }): string {
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
