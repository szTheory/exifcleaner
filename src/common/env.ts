import electron from "electron";

if (typeof electron === "string") {
	throw new TypeError("Not running in an Electron environment!");
}

export const isDev = isEnvSet() ? isDevEnv() : !app().isPackaged;

export function isProd(): boolean {
	return process.env.NODE_ENV === "production" && app().isPackaged;
}

// function app(): electron.App {
// 	return electron.app || electron.remote.app;
// }

function app(): electron.App {
	return electron.app;
}

function isEnvSet(): boolean {
	return "ELECTRON_IS_DEV" in process.env;
}

function isDevEnv(): boolean {
	return process.env.ELECTRON_IS_DEV
		? parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
		: false;
}
