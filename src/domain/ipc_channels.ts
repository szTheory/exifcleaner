// Re-export for backward compatibility during migration.
// Consumers should import from infrastructure/ipc/ipc_channels.ts directly.
export { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";

// Legacy named exports for files that still import individual constants
import { IPC_CHANNELS } from "../infrastructure/ipc/ipc_channels";
export const EVENT_FILES_ADDED = IPC_CHANNELS.FILES_ADDED;
export const EVENT_FILE_PROCESSED = IPC_CHANNELS.FILE_PROCESSED;
export const EVENT_ALL_FILES_PROCESSED = IPC_CHANNELS.ALL_FILES_PROCESSED;
export const EVENT_FILE_OPEN_ADD_FILES = IPC_CHANNELS.FILE_OPEN_ADD_FILES;
export const IPC_EVENT_NAME_GET_LOCALE = IPC_CHANNELS.GET_LOCALE;
