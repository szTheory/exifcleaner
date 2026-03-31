import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Result } from "../common/result";
import { isSupportedFile } from "../domain/file_types";

export class ExpandFolderCommand {
	async execute({ dirPath }: { dirPath: string }): Promise<Result<string[]>> {
		try {
			const entries = await readdir(dirPath, {
				recursive: true,
				withFileTypes: true,
			});

			const filePaths: string[] = [];
			for (const entry of entries) {
				if (entry.isFile() && isSupportedFile(entry.name)) {
					filePaths.push(path.join(entry.parentPath, entry.name));
				}
			}

			return { ok: true, value: filePaths };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: "Failed to read directory: " + message,
			};
		}
	}
}
