import { app } from "electron";

export function isProd(): boolean {
	return app.isPackaged;
}

export function isDev(): boolean {
	return !isProd();
}
