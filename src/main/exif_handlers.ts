import { ipcMain } from "electron";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { exifReadSchema, exifRemoveSchema } from "./ipc/ipc_schemas";

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
				preserveRotation: settings.preserveRotation,
				preserveTimestamps: settings.preserveTimestamps,
			});
			if (result.ok) {
				return { data: null, error: null };
			}
			return { data: null, error: result.error };
		}),
	);
}
