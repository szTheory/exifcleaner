import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import type { Result } from "../common/result";
import type { SettingsPort } from "./settings_port";
import type { LoggerPort } from "./logger_port";
import type { StripMetadataCommand } from "./strip_metadata_command";
import type { ReadMetadataQuery } from "./read_metadata_query";
import type { ExpandFolderCommand } from "./expand_folder_command";
import type { XattrCommand } from "./xattr_command";
import { generateCleanedPath } from "../domain/cleaned_path";

export interface FileResult {
	filePath: string;
	status: "success" | "error" | "skipped";
	error?: string;
}

export class ProcessFilesUseCase {
	private readonly stripMetadata: StripMetadataCommand;
	private readonly readMetadata: ReadMetadataQuery;
	private readonly expandFolder: ExpandFolderCommand;
	private readonly xattr: XattrCommand;
	private readonly settings: SettingsPort;
	private readonly logger: LoggerPort;

	constructor({
		stripMetadata,
		readMetadata,
		expandFolder,
		xattr,
		settings,
		logger,
	}: {
		stripMetadata: StripMetadataCommand;
		readMetadata: ReadMetadataQuery;
		expandFolder: ExpandFolderCommand;
		xattr: XattrCommand;
		settings: SettingsPort;
		logger: LoggerPort;
	}) {
		this.stripMetadata = stripMetadata;
		this.readMetadata = readMetadata;
		this.expandFolder = expandFolder;
		this.xattr = xattr;
		this.settings = settings;
		this.logger = logger;
	}

	async execute({
		paths,
		onProgress,
		signal,
	}: {
		paths: string[];
		onProgress?: (result: FileResult) => void;
		signal?: AbortSignal;
	}): Promise<Result<FileResult[]>> {
		// Expand folders into individual file paths
		const filePaths: string[] = [];
		for (const p of paths) {
			try {
				const info = await stat(p);
				if (info.isDirectory()) {
					const expanded = await this.expandFolder.execute({
						dirPath: p,
					});
					if (expanded.ok) {
						filePaths.push(...expanded.value);
					} else {
						this.logger.warn("Failed to expand folder", {
							path: p,
							error: expanded.error,
						});
					}
				} else {
					filePaths.push(p);
				}
			} catch {
				// If stat fails, treat as a file path (will fail at strip step)
				filePaths.push(p);
			}
		}

		const currentSettings = this.settings.get();
		const results: FileResult[] = [];

		// Process each file sequentially (ExifTool is single-process)
		for (const filePath of filePaths) {
			if (signal?.aborted) {
				// Mark remaining files as skipped
				results.push({ filePath, status: "skipped" });
				const skippedResult: FileResult = {
					filePath,
					status: "skipped",
				};
				onProgress?.(skippedResult);
				continue;
			}

			const outputPath = currentSettings.saveAsCopy
				? generateCleanedPath(filePath, (p) => existsSync(p))
				: undefined;

			const stripResult = await this.stripMetadata.execute({
				filePath,
				preserveOrientation: currentSettings.preserveOrientation,
				preserveColorProfile: currentSettings.preserveColorProfile,
				preserveTimestamps: currentSettings.preserveTimestamps,
				saveAsCopy: currentSettings.saveAsCopy,
				outputPath,
				signal,
			});

			let fileResult: FileResult;
			if (stripResult.ok) {
				// Run xattr removal after successful strip if enabled
				if (currentSettings.removeXattrs) {
					await this.xattr.execute({
						filePath: outputPath ?? filePath,
					});
				}
				fileResult = { filePath, status: "success" };
			} else {
				fileResult = {
					filePath,
					status: "error",
					error: stripResult.error,
				};
				this.logger.warn("File processing failed", {
					filePath,
					error: stripResult.error,
				});
			}

			results.push(fileResult);
			onProgress?.(fileResult);
		}

		return { ok: true, value: results };
	}
}
