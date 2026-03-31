import { exec } from "node:child_process";
import { isMac } from "../../common/platform";
import type { LoggerPort } from "../../application/logger_port";

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
				logger.warn("Failed to remove xattrs", {
					filePath,
					error: error.message,
				});
			}
			resolve();
		});
	});
}
