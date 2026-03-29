import type { LoggerPort } from "./logger_port";

export interface XattrPort {
	removeXattrs(args: { filePath: string; logger: LoggerPort }): Promise<void>;
}

export class XattrCommand {
	private readonly xattr: XattrPort;
	private readonly logger: LoggerPort;

	constructor({ xattr, logger }: { xattr: XattrPort; logger: LoggerPort }) {
		this.xattr = xattr;
		this.logger = logger;
	}

	async execute({ filePath }: { filePath: string }): Promise<void> {
		await this.xattr.removeXattrs({ filePath, logger: this.logger });
	}
}
