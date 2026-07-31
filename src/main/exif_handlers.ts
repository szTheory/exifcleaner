import { ipcMain } from "electron";
import { existsSync } from "node:fs";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";
import { generateCleanedPath } from "../domain/files/cleaned_path";

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
			const outputPath = settings.saveAsCopy
				? generateCleanedPath({ filePath, exists: existsSync })
				: filePath;
			const result = await container.stripMetadata.execute({
				filePath,
				preserveOrientation: settings.preserveOrientation,
				preserveColorProfile: settings.preserveColorProfile,
				preserveTimestamps: settings.preserveTimestamps,
				saveAsCopy: settings.saveAsCopy,
				outputPath,
			});
			if (result.ok) {
				return { success: true, outputPath };
			}
			return { success: false, error: formatExifError(result.error) };
		}),
	);
}
