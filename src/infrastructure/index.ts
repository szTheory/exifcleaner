// Infrastructure layer barrel file — re-exports adapters, services, and utilities.

// ExifTool
export { ExiftoolProcess } from "./exiftool/ExiftoolProcess";
export { ExifToolAdapter } from "./exiftool/exiftool_adapter";
export type { ExifToolResult, ExifToolCloseResult } from "./exiftool/types";

// Settings
export { SettingsService } from "./settings_service";

// Logging
export { ConsoleLogger } from "./console_logger";

// Xattr
export { removeXattrs } from "./xattr_service";

// Electron utilities
export { exiftoolBinPath } from "./electron/binaries";
export {
	currentBrowserWindow,
	defaultBrowserWindow,
	restoreWindowAndFocus,
} from "./electron/browser_window";
export { isProd, isDev } from "./electron/env";
export { resourcesPath, iconPath, checkmarkPath } from "./electron/resources";
export {
	i18n,
	preloadI18nStrings,
	getI18nStrings,
} from "./electron/i18n_strings";
