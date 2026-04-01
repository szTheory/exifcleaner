import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Result } from "../../common";
import type { FolderError } from "../../domain";
import { isSupportedFile } from "../../domain";

export class ExpandFolderCommand {
	async execute({
		dirPath,
	}: {
		dirPath: string;
	}): Promise<Result<string[], FolderError>> {
		try {
			const entries = await readdir(dirPath, {
				recursive: true,
				withFileTypes: true,
			});

			const filePaths: string[] = [];
			for (const entry of entries) {
				if (entry.isFile() && isSupportedFile({ filename: entry.name })) {
					filePaths.push(path.join(entry.parentPath, entry.name));
				}
			}

			return { ok: true, value: filePaths };
		} catch (err: unknown) {
			return {
				ok: false,
				error: {
					code: "read-failed",
					dirPath,
					cause: err instanceof Error ? err.message : String(err),
				},
			};
		}
	}
}
