import { ipcMain } from "electron";
import type { Container } from "./container";

export function setupExifHandlers({
	container,
}: {
	container: Container;
}): void {
	ipcMain.handle(
		"exif:read",
		async (_event, filePath: string) => {
			const result = await container.readMetadata.execute({ filePath });
			if (result.ok) {
				return result.value;
			}
			return {};
		},
	);

	ipcMain.handle(
		"exif:remove",
		async (_event, filePath: string) => {
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
		},
	);
}
