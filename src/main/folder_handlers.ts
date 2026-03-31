import { ipcMain } from "electron";
import { stat } from "node:fs/promises";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import { folderClassifySchema, folderExpandSchema } from "./ipc/ipc_schemas";

export function setupFolderHandlers({
	container,
}: {
	container: Container;
}): void {
	ipcMain.handle(
		"folder:classify",
		createValidatedHandler(folderClassifySchema, async (paths) => {
			const files: string[] = [];
			const folders: string[] = [];

			for (const p of paths) {
				try {
					const s = await stat(p);
					if (s.isDirectory()) {
						folders.push(p);
					} else if (s.isFile()) {
						files.push(p);
					}
				} catch (err: unknown) {
					// Skip inaccessible paths (ENOENT, EPERM)
					console.warn(
						`[folder:classify] Skipped inaccessible path: ${p}`,
					);
				}
			}

			return { files, folders };
		}),
	);

	ipcMain.handle(
		"folder:expand",
		createValidatedHandler(folderExpandSchema, async (dirPath) => {
			const result = await container.expandFolder.execute({ dirPath });

			if (result.ok) {
				return { files: result.value, skippedCount: 0 };
			}

			return { files: [], skippedCount: 0, error: result.error };
		}),
	);
}
