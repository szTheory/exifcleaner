import electron from "electron";

if (typeof electron === "string") {
	throw new TypeError("Not running in an Electron environment!");
}

export function isProd(): boolean {
	return process.env.NODE_ENV === "production";
}

export function isDev(): boolean {
	return !isProd();
}
