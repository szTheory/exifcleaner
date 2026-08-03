import {
	dialog,
	ipcMain,
	type BrowserWindow,
	type OpenDialogOptions,
} from "electron";
import { stat } from "node:fs/promises";
import type { Container } from "./container";
import { createValidatedHandler } from "./ipc/ipc_validation";
import {
	filesChooseSchema,
	folderChooseSchema,
	folderClassifySchema,
	folderExpandSchema,
} from "./ipc/ipc_schemas";
import { logError } from "../common";
import { IPC_CHANNELS } from "../common";
import type { ClassifiedFile } from "../common/ipc_channels";
import { formatFolderError } from "../domain";

export function setupFolderHandlers({
	container,
	getWindow,
}: {
	container: Container;
	getWindow: () => BrowserWindow | null;
}): void {
	ipcMain.handle(
		IPC_CHANNELS.FILES_CHOOSE,
		createValidatedHandler(filesChooseSchema, async () => {
			const window = getWindow();
			const options: OpenDialogOptions = {
				properties: ["openFile", "multiSelections"],
			};
			const result = window
				? await dialog.showOpenDialog(window, options)
				: await dialog.showOpenDialog(options);
			return result.canceled
				? []
				: result.filePaths.filter((path) => !/[\r\n]/u.test(path));
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.FOLDER_CHOOSE,
		createValidatedHandler(folderChooseSchema, async () => {
			const window = getWindow();
			const options: OpenDialogOptions = { properties: ["openDirectory"] };
			const result = window
				? await dialog.showOpenDialog(window, options)
				: await dialog.showOpenDialog(options);
			const selectedPath = result.canceled ? undefined : result.filePaths[0];
			return selectedPath !== undefined && !/[\r\n]/u.test(selectedPath)
				? selectedPath
				: null;
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.FOLDER_CLASSIFY,
		createValidatedHandler(folderClassifySchema, async (paths) => {
			const files: ClassifiedFile[] = [];
			const folders: string[] = [];

			for (const p of paths) {
				try {
					const s = await stat(p);
					if (s.isDirectory()) {
						folders.push(p);
					} else if (s.isFile()) {
						// s.size comes free with the stat already needed for isFile().
						files.push({ path: p, size: s.size });
					}
				} catch (err: unknown) {
					// Skip inaccessible paths (ENOENT, EPERM) — expected for stale drag-drop
					logError("folder:classify", err);
				}
			}

			return { files, folders };
		}),
	);

	ipcMain.handle(
		IPC_CHANNELS.FOLDER_EXPAND,
		createValidatedHandler(folderExpandSchema, async (dirPath) => {
			const result = await container.expandFolder.execute({ dirPath });

			if (result.ok) {
				return {
					files: result.value.files,
					skippedCount: result.value.skippedCount,
				};
			}

			return {
				files: [],
				skippedCount: 0,
				error: formatFolderError(result.error),
			};
		}),
	);
}
