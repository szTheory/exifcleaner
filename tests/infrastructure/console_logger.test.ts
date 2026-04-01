import { describe, it, expect, vi, afterEach } from "vitest";
import { ConsoleLogger } from "../../src/infrastructure/console_logger";

describe("ConsoleLogger", () => {
	afterEach(() => vi.restoreAllMocks());

	it("info calls console.log with message only when no context", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.info({ message: "hello" });

		expect(spy).toHaveBeenCalledWith("hello");
	});

	it("info calls console.log with message and context when context provided", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.info({ message: "hello", context: { file: "test.jpg" } });

		expect(spy).toHaveBeenCalledWith("hello", { file: "test.jpg" });
	});

	it("warn calls console.warn with message only when no context", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.warn({ message: "caution" });

		expect(spy).toHaveBeenCalledWith("caution");
	});

	it("warn calls console.warn with message and context when context provided", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.warn({ message: "caution", context: { code: 42 } });

		expect(spy).toHaveBeenCalledWith("caution", { code: 42 });
	});

	it("error calls console.error with message only when no context", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.error({ message: "boom" });

		expect(spy).toHaveBeenCalledWith("boom");
	});

	it("error calls console.error with message and context when context provided", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logger = new ConsoleLogger();

		logger.error({ message: "boom", context: { reason: "EACCES" } });

		expect(spy).toHaveBeenCalledWith("boom", { reason: "EACCES" });
	});
});
