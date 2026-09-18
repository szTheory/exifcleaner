import { app } from "electron";
import path from "node:path";
import { rename, unlink } from "node:fs/promises";
import {
	ExiftoolProcess,
	ExifToolAdapter,
	HybridMetadataEngine,
	NativeMetadataAdapter,
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
	metadataEngine: HybridMetadataEngine;
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
	const native = new NativeMetadataAdapter();
	const metadataEngine = new HybridMetadataEngine({ exiftool, native });
	const settingsPath = path.join(app.getPath("userData"), "settings.json");
	const settings = new SettingsService({ filePath: settingsPath, logger });
	const stripMetadata = new StripMetadataCommand({ metadataEngine });
	const readMetadata = new ReadMetadataQuery({ metadataEngine });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
		metadataEngine,
	});
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
		metadataEngine,
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
	await container.exiftoolProcess.open();
	await container.settings.load();
}
