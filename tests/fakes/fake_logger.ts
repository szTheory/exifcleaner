import type { LoggerPort } from "../../src/application/logger_port";

export class FakeLogger implements LoggerPort {
	messages: Array<{
		level: string;
		message: string;
		context?: Record<string, unknown>;
	}> = [];

	info({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void {
		this.messages.push({ level: "info", message, context });
	}

	warn({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void {
		this.messages.push({ level: "warn", message, context });
	}

	error({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void {
		this.messages.push({ level: "error", message, context });
	}
}
