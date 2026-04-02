export function logError(domain: string, error: unknown): void {
	console.error(`[${domain}]`, error);
}
