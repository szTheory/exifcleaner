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
	SETTINGS_TOGGLE: "settings:toggle",
	// Theme channels for Phase 3
	THEME_GET: "theme:get",
	THEME_CHANGED: "theme:changed",
	// Theme channels for Phase 6 (dark mode control)
	THEME_SET: "theme:set",
	THEME_ACCENT_COLOR: "theme:accent-color",
	THEME_ACCENT_COLOR_CHANGED: "theme:accent-color-changed",
	THEME_MODE_CHANGED_FROM_MENU: "theme:mode-changed-from-menu",
	// Language channels for Phase 7
	LANGUAGE_CHANGED: "language:changed",
	// Folder recursion channels for Phase 7
	FOLDER_CLASSIFY: "folder:classify",
	FOLDER_EXPAND: "folder:expand",
} as const;
