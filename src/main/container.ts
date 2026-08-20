import { app } from "electron";
import path from "node:path";
import { rename, unlink } from "node:fs/promises";
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
	ExpandFolderQuery,
	RemoveXattrCommand,
	VerifyGeneratedOutputQuery,
} from "../application";
import { OutputTransaction } from "./output_transaction";

export function createContainer(): {
	exiftoolProcess: ExiftoolProcess;
	exiftool: ExifToolAdapter;
	settings: SettingsService;
	logger: ConsoleLogger;
	stripMetadata: StripMetadataCommand;
	readMetadata: ReadMetadataQuery;
	expandFolder: ExpandFolderQuery;
	removeXattrCommand: RemoveXattrCommand;
	verifyGeneratedOutput: VerifyGeneratedOutputQuery;
	outputTransaction: OutputTransaction;
} {
	const logger = new ConsoleLogger();
	const exiftoolProcess = new ExiftoolProcess({ binPath: exiftoolBinPath });
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const settingsPath = path.join(app.getPath("userData"), "settings.json");
	const settings = new SettingsService({ filePath: settingsPath, logger });
	const stripMetadata = new StripMetadataCommand({ exiftool });
	const readMetadata = new ReadMetadataQuery({ exiftool });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({ exiftool });
	const outputTransaction = new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		unlink,
		rename,
		delay: async (milliseconds) => {
			await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
		},
	});
	const expandFolder = new ExpandFolderQuery();
	const xattrAdapter = { removeXattrs };
	const removeXattrCommand = new RemoveXattrCommand({
		xattr: xattrAdapter,
		logger,
	});

	return {
		exiftoolProcess,
		exiftool,
		settings,
		logger,
		stripMetadata,
		readMetadata,
		verifyGeneratedOutput,
		outputTransaction,
		expandFolder,
		removeXattrCommand,
	};
}

export type Container = ReturnType<typeof createContainer>;

export async function initContainer(container: Container): Promise<void> {
	await container.exiftool.open();
	await container.settings.load();
}
