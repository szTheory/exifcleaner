import { exec } from "node:child_process";
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

	return new Promise((resolve) => {
		exec(`xattr -cr "${filePath}"`, (error) => {
			if (error) {
				logger.warn({
					message: "Failed to remove xattrs",
					context: { filePath, error: error.message },
				});
			}
			resolve();
		});
	});
}
