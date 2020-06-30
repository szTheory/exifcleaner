const electron = require("electron");

if (typeof electron === "string") {
	throw new TypeError("Not running in an Electron environment!");
}

const app = electron.app || electron.remote.app;

const isEnvSet = "ELECTRON_IS_DEV" in process.env;
const getFromEnv = process.env.ELECTRON_IS_DEV
	? parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
	: false;

export const isDev = isEnvSet ? getFromEnv : !app.isPackaged;
