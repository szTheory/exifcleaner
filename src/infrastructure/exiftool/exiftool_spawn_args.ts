/** Env var the POSIX watchdog config reads as the pid of the parent that must stay alive (LIF-01). */
export const EXIFCLEANER_PARENT_PID_ENV = "EXIFCLEANER_PARENT_PID";

/**
 * Spawn argv for a `-stay_open` ExifTool session (D-04).
 *
 * On POSIX `-config <path>` must be argv index 0: ExifTool only honours it as the very first
 * argument, otherwise it prints "Ignored -config option" and loads `~/.ExifTool_config`.
 * `configPath` must be absolute; a relative one resolves via `$exeDir` and `.` in `@INC`.
 * Windows never receives `-config` (the watchdog is POSIX-only, D-07).
 */
export function exiftoolSpawnArgs({
	platform,
	configPath,
}: {
	platform: NodeJS.Platform;
	configPath: string;
}): string[] {
	if (platform === "win32") {
		return ["-stay_open", "True", "-@", "-"];
	}
	return ["-config", configPath, "-stay_open", "True", "-@", "-"];
}

/**
 * Spawn env for the session (D-04). POSIX always overwrites the parent-pid key with the real
 * pid, so a user-set value in the inherited env can never redirect the watchdog. Never mutates
 * `base`.
 */
export function exiftoolSpawnEnv({
	platform,
	base,
	parentPid,
}: {
	platform: NodeJS.Platform;
	base: NodeJS.ProcessEnv;
	parentPid: number;
}): NodeJS.ProcessEnv {
	if (platform === "win32") {
		return base;
	}
	return { ...base, [EXIFCLEANER_PARENT_PID_ENV]: String(parentPid) };
}
