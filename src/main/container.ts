import { app } from "electron";
import path from "node:path";
import {
	ExiftoolProcess,
	ExifToolAdapter,
	SettingsService,
	ConsoleLogger,
	removeXattrs,
	exiftoolBinPath,
} from "../infrastructure";
import {
	StripMetadataCommand,
	ReadMetadataQuery,
	ExpandFolderCommand,
	XattrCommand,
} from "../application";

export function createContainer(): {
	exiftoolProcess: ExiftoolProcess;
	exiftool: ExifToolAdapter;
	settings: SettingsService;
	logger: ConsoleLogger;
	stripMetadata: StripMetadataCommand;
	readMetadata: ReadMetadataQuery;
	expandFolder: ExpandFolderCommand;
	xattrCommand: XattrCommand;
} {
	const logger = new ConsoleLogger();
	const exiftoolProcess = new ExiftoolProcess({ binPath: exiftoolBinPath });
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const settingsPath = path.join(app.getPath("userData"), "settings.json");
	const settings = new SettingsService({ filePath: settingsPath, logger });
	const stripMetadata = new StripMetadataCommand({ exiftool });
	const readMetadata = new ReadMetadataQuery({ exiftool });
	const expandFolder = new ExpandFolderCommand();
	const xattrAdapter = { removeXattrs };
	const xattrCommand = new XattrCommand({ xattr: xattrAdapter, logger });

	return {
		exiftoolProcess,
		exiftool,
		settings,
		logger,
		stripMetadata,
		readMetadata,
		expandFolder,
		xattrCommand,
	};
}

export type Container = ReturnType<typeof createContainer>;

export async function initContainer(container: Container): Promise<void> {
	await container.exiftool.open();
	await container.settings.load();
}
