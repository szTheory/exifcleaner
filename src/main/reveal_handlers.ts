import { ipcMain, shell, Menu, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { createValidatedHandler } from "./ipc/ipc_validation";
import {
	fileRevealSchema,
	fileRevealContextMenuSchema,
} from "./ipc/ipc_schemas";

export function setupRevealHandlers(): void {
	// Simple reveal: show file in system file manager
	ipcMain.handle(
		"file:reveal",
		createValidatedHandler(fileRevealSchema, async (filePath: string) => {
			if (!existsSync(filePath)) {
				return { success: false, error: "File no longer exists" };
			}
			shell.showItemInFolder(filePath);
			return { success: true };
		}),
	);

	// Context menu reveal for save-as-copy mode (per D-21)
	ipcMain.handle(
		"file:reveal-context-menu",
		createValidatedHandler(
			fileRevealContextMenuSchema,
			async ({ cleanedPath, originalPath }) => {
				const win = BrowserWindow.getAllWindows()[0];
				if (win === undefined) return { success: false };

				const menu = Menu.buildFromTemplate([
					{
						label: "Reveal Cleaned Copy",
						click: () => {
							if (existsSync(cleanedPath)) {
								shell.showItemInFolder(cleanedPath);
							}
						},
					},
					{
						label: "Reveal Original",
						click: () => {
							if (existsSync(originalPath)) {
								shell.showItemInFolder(originalPath);
							}
						},
					},
				]);
				menu.popup({ window: win });
				return { success: true };
			},
		),
	);
}
