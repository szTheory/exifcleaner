// IPC event names shared between main and renderer processes.
// Extracted here so renderer code does not import from main process modules.

export const EVENT_FILES_ADDED = "files-added";
export const EVENT_FILE_PROCESSED = "file-processed";
export const EVENT_ALL_FILES_PROCESSED = "all-files-processed";
export const EVENT_FILE_OPEN_ADD_FILES = "file-open-add-files";
export const IPC_EVENT_NAME_GET_LOCALE = "get-locale";
