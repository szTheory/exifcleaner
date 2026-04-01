export interface LoggerPort {
	info({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void;
	warn({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void;
	error({
		message,
		context,
	}: {
		message: string;
		context?: Record<string, unknown>;
	}): void;
}
