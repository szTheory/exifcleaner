import { execFile } from "node:child_process";
import { isMac } from "../common";
import type { LoggerPort } from "../application";

export function removeXattrs({
	filePath,
	logger,
}: {
	filePath: string;
	logger: LoggerPort;
}): Promise<void> {
	if (!isMac()) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		execFile(XATTR_EXECUTABLE, [...XATTR_CLEAR_ARGS, filePath], (error) => {
			if (error) {
				logger.warn({
					message: "Failed to remove xattrs",
					context: { filePath, error: error.message },
				});
				reject(error);
				return;
			}
			resolve();
		});
	});
}

export const XATTR_EXECUTABLE = "/usr/bin/xattr";
export const XATTR_CLEAR_ARGS = ["-c", "--"] as const;
