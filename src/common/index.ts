// Common layer barrel file — re-exports all shared types and utilities.

export { isMac, isWindows, isLinux, getPlatform, Platform } from "./platform";
export { assertNever, getOrThrow } from "./types";

export type { Result } from "./result";
export { IPC_CHANNELS } from "./ipc_channels";
