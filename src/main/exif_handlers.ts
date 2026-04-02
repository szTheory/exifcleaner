import { ipcMain } from "electron";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";
import { formatExifError } from "../domain";

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
			const result = await container.stripMetadata.execute({
				filePath,
				preserveOrientation: settings.preserveOrientation,
				preserveColorProfile: settings.preserveColorProfile,
				preserveTimestamps: settings.preserveTimestamps,
				saveAsCopy: settings.saveAsCopy,
			});
			if (result.ok) {
				return { data: null, error: null };
			}
			return { data: null, error: formatExifError(result.error) };
		}),
	);
}
