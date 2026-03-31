// Application layer barrel file — re-exports commands, queries, ports, and use cases.

export type { ExifToolPort } from "./exiftool_port";
export type { LoggerPort } from "./logger_port";
export type { SettingsPort } from "./settings_port";
export type { XattrPort } from "./commands/xattr_command";
export { XattrCommand } from "./commands/xattr_command";
export { StripMetadataCommand } from "./commands/strip_metadata_command";
export { ReadMetadataQuery } from "./queries/read_metadata_query";
export { ExpandFolderCommand } from "./commands/expand_folder_command";
export { ProcessFilesUseCase } from "./process_files_use_case";
export type { FileResult } from "./process_files_use_case";
