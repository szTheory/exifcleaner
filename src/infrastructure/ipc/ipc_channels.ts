export const IPC_CHANNELS = {
	// Existing channels (preserved for backward compatibility with current renderer)
	FILES_ADDED: "files-added",
	FILE_PROCESSED: "file-processed",
	ALL_FILES_PROCESSED: "all-files-processed",
	FILE_OPEN_ADD_FILES: "file-open-add-files",
	GET_LOCALE: "get-locale",
	GET_I18N_STRINGS: "get-i18n-strings",
	EXIF_READ: "exif:read",
	EXIF_REMOVE: "exif:remove",
	// New channels for Phase 2
	SETTINGS_GET: "settings:get",
	SETTINGS_SET: "settings:set",
	SETTINGS_CHANGED: "settings:changed",
} as const;
