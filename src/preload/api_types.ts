import type { I18nStringsDictionary } from "../common/i18n_lookup";

export type { I18nStringsDictionary };

export interface ExifData {
	[key: string]: unknown;
}

export interface ExifApi {
	readMetadata: (filePath: string) => Promise<ExifData>;
	removeMetadata: (filePath: string) => Promise<object>;
}

export interface I18nApi {
	getLocale: () => Promise<string>;
	getStrings: () => Promise<I18nStringsDictionary>;
}

export interface FilesApi {
	basename: (filePath: string) => string;
	getPathForFile: (file: File) => string;
	notifyFilesAdded: (count: number) => void;
	notifyFileProcessed: () => void;
	notifyAllFilesProcessed: () => void;
	onFileOpenAddFiles: (callback: (filePaths: string[]) => void) => () => void;
}

export interface ElectronApi {
	exif: ExifApi;
	i18n: I18nApi;
	files: FilesApi;
}
