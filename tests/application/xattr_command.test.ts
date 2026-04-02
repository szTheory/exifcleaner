import { describe, it, expect, beforeEach } from "vitest";
import { XattrCommand } from "../../src/application/commands/xattr_command";
import type { XattrPort } from "../../src/application/commands/xattr_command";
import type { LoggerPort } from "../../src/application/logger_port";
import { FakeLogger } from "../fakes/fake_logger";

class FakeXattrPort implements XattrPort {
	calls: { filePath: string; logger: LoggerPort }[] = [];
	shouldThrow = false;

	async removeXattrs({
		filePath,
		logger,
	}: {
		filePath: string;
		logger: LoggerPort;
	}): Promise<void> {
		if (this.shouldThrow) {
			throw new Error("xattr -cr: Operation not supported");
		}
		this.calls.push({ filePath, logger });
	}
}

let xattr: FakeXattrPort;
let logger: FakeLogger;
let command: XattrCommand;

beforeEach(() => {
	xattr = new FakeXattrPort();
	logger = new FakeLogger();
	command = new XattrCommand({ xattr, logger });
});

describe("XattrCommand", () => {
	it("delegates filePath to xattr port on execute", async () => {
		await command.execute({ filePath: "/tmp/photo.jpg" });

		expect(xattr.calls[0]?.filePath).toBe("/tmp/photo.jpg");
	});

	it("passes logger reference to xattr port", async () => {
		await command.execute({ filePath: "/tmp/photo.jpg" });

		expect(xattr.calls[0]?.logger).toBe(logger);
	});

	it("propagates rejection when xattr port throws", async () => {
		xattr.shouldThrow = true;

		await expect(
			command.execute({ filePath: "/tmp/photo.jpg" }),
		).rejects.toThrow("xattr -cr: Operation not supported");
	});
});
