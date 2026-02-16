export function isProd(): boolean {
	return process.env.NODE_ENV === "production";
}

export function isDev(): boolean {
	return !isProd();
}
