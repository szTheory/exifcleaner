// Domain barrel file — re-exports all domain types and functions.

export type { ExifData } from "./exif/exif";
export type { Settings, SettingsFile, ThemeMode } from "./settings_schema";
export type { I18nStringSet, I18nStringsDictionary } from "./i18n/i18n_lookup";
export type { LanguageEntry } from "./i18n/language_names";
export type {
	MetadataDiffField,
	MetadataDiffGroup,
} from "./exif/metadata_groups";

export { cleanExifData } from "./exif/exif";
export { Locale, i18nLookup, fallbackLocale } from "./i18n/i18n_lookup";
export {
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
	isSettingsFile,
	migrateSettings,
	validateSettings,
} from "./settings_schema";
export { SUPPORTED_EXTENSIONS, isSupportedFile } from "./files/file_types";
export { FileProcessingStatus } from "./files/file_status";
export { ACCENT_COLOR_FALLBACK, parseAccentColorHex } from "./accent_color";
export { generateCleanedPath } from "./files/cleaned_path";
export { LANGUAGE_NAMES } from "./i18n/language_names";
export {
	getFriendlyGroupKey,
	parseGroupedKey,
	computeMetadataDiff,
} from "./exif/metadata_groups";
export { middleTruncatePath } from "./path_truncation";
export type { ExifError } from "./exif/exif_errors";
export { formatExifError } from "./exif/exif_errors";
export type { SettingsError } from "./settings_errors";
export { formatSettingsError } from "./settings_errors";
export type { FolderError } from "./files/folder_errors";
export { formatFolderError } from "./files/folder_errors";
export type { WindowStateError } from "./window_state_errors";
export { formatWindowStateError } from "./window_state_errors";
