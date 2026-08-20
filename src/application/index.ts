// Application layer barrel file — re-exports commands, queries, ports, and use cases.

export type { ExifToolPort } from "./exiftool_port";
export type { LoggerPort } from "./logger_port";
export type { SettingsPort } from "./settings_port";
export type { XattrPort } from "./commands/remove_xattr_command";

export { RemoveXattrCommand } from "./commands/remove_xattr_command";
export { StripMetadataCommand } from "./commands/strip_metadata_command";
export { ReadMetadataQuery } from "./queries/read_metadata_query";
export {
	VerifyGeneratedOutputQuery,
	type OutputVerificationError,
} from "./queries/verify_generated_output_query";
export { ExpandFolderCommand } from "./commands/expand_folder_command";
