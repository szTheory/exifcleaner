import { app } from "electron";
import path from "node:path";
import { ExiftoolProcess } from "../infrastructure/exiftool/ExiftoolProcess";
import { ExifToolAdapter } from "../infrastructure/exiftool/exiftool_adapter";
import { SettingsService } from "../infrastructure/settings/settings_service";
import { ConsoleLogger } from "../infrastructure/logging/console_logger";
import { StripMetadataCommand } from "../application/strip_metadata_command";
import { ReadMetadataQuery } from "../application/read_metadata_query";
import { ExpandFolderCommand } from "../application/expand_folder_command";
import { XattrCommand } from "../application/xattr_command";
import { removeXattrs } from "../infrastructure/xattr/xattr_service";
import { ProcessFilesUseCase } from "../application/process_files_use_case";
import { exiftoolBinPath } from "../infrastructure/electron/binaries";

export function createContainer(): {
	exiftoolProcess: ExiftoolProcess;
	exiftool: ExifToolAdapter;
	settings: SettingsService;
	logger: ConsoleLogger;
	stripMetadata: StripMetadataCommand;
	readMetadata: ReadMetadataQuery;
	expandFolder: ExpandFolderCommand;
	xattrCommand: XattrCommand;
	processFiles: ProcessFilesUseCase;
} {
	const logger = new ConsoleLogger();
	const exiftoolProcess = new ExiftoolProcess(exiftoolBinPath);
	const exiftool = new ExifToolAdapter(exiftoolProcess);
	const settingsPath = path.join(app.getPath("userData"), "settings.json");
	const settings = new SettingsService({ filePath: settingsPath, logger });
	const stripMetadata = new StripMetadataCommand({ exiftool });
	const readMetadata = new ReadMetadataQuery({ exiftool });
	const expandFolder = new ExpandFolderCommand();
	const xattrAdapter = { removeXattrs };
	const xattrCommand = new XattrCommand({ xattr: xattrAdapter, logger });
	const processFiles = new ProcessFilesUseCase({
		stripMetadata,
		readMetadata,
		expandFolder,
		xattr: xattrCommand,
		settings,
		logger,
	});

	return {
		exiftoolProcess,
		exiftool,
		settings,
		logger,
		stripMetadata,
		readMetadata,
		expandFolder,
		xattrCommand,
		processFiles,
	};
}

export type Container = ReturnType<typeof createContainer>;

export async function initContainer(container: Container): Promise<void> {
	await container.exiftool.open();
	await container.settings.load();
}
