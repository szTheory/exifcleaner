import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Result } from "../../common";
import type { FolderError } from "../../domain";
import { isSupportedFile } from "../../domain";

export interface ExpandedFolder {
	files: string[];
	skippedCount: number;
}

export class ExpandFolderQuery {
	async execute({
		dirPath,
	}: {
		dirPath: string;
	}): Promise<Result<ExpandedFolder, FolderError>> {
		try {
			const entries = await readdir(dirPath, {
				recursive: true,
				withFileTypes: true,
			});

			const filePaths: string[] = [];
			let skippedCount = 0;
			for (const entry of entries) {
				if (!entry.isFile()) continue;

				if (isSupportedFile({ filename: entry.name })) {
					filePaths.push(path.join(entry.parentPath, entry.name));
				} else {
					skippedCount += 1;
				}
			}

			return { ok: true, value: { files: filePaths, skippedCount } };
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
