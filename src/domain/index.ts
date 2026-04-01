// Domain barrel file — re-exports all domain types and functions.

export type { ExifData } from "./exif/exif";
export { cleanExifData } from "./exif/exif";

export { Locale, i18nLookup, fallbackLocale } from "./i18n/i18n_lookup";
export type { I18nStringSet, I18nStringsDictionary } from "./i18n/i18n_lookup";

export type { Settings, SettingsFile, ThemeMode } from "./settings_schema";
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

export type { LanguageEntry } from "./i18n/language_names";
export { LANGUAGE_NAMES } from "./i18n/language_names";

export type {
	MetadataDiffField,
	MetadataDiffGroup,
} from "./exif/metadata_groups";
export {
	getFriendlyGroupKey,
	parseGroupedKey,
	computeMetadataDiff,
} from "./exif/metadata_groups";

export { middleTruncatePath } from "./path_truncation";
