import { ipcMain } from "electron";
import { existsSync } from "node:fs";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";
import { generateCleanedPath } from "../domain/files/cleaned_path";
import { isRawFile } from "../domain/files/file_types";

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
			const wasForcedCopy =
				isRawFile({ filename: filePath }) && !settings.saveAsCopy;
			const saveAsCopy = settings.saveAsCopy || wasForcedCopy;
			const outputPath = saveAsCopy
				? generateCleanedPath({ filePath, exists: existsSync })
				: undefined;
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
