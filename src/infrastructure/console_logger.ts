import type { LoggerPort } from "../application";

export class ConsoleLogger implements LoggerPort {
	info(message: string, context?: Record<string, unknown>): void {
		if (context) {
			console.log(message, context);
		} else {
			console.log(message);
		}
	}

	warn(message: string, context?: Record<string, unknown>): void {
		if (context) {
			console.warn(message, context);
		} else {
			console.warn(message);
		}
	}

	error(message: string, context?: Record<string, unknown>): void {
		if (context) {
			console.error(message, context);
		} else {
			console.error(message);
		}
	}
}
