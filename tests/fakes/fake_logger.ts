import type { LoggerPort } from "../../src/application/logger_port";

export class FakeLogger implements LoggerPort {
	messages: Array<{
		level: string;
		message: string;
		context?: Record<string, unknown>;
	}> = [];

	info(message: string, context?: Record<string, unknown>): void {
		this.messages.push({ level: "info", message, context });
	}

	warn(message: string, context?: Record<string, unknown>): void {
		this.messages.push({ level: "warn", message, context });
	}

	error(message: string, context?: Record<string, unknown>): void {
		this.messages.push({ level: "error", message, context });
	}
}
