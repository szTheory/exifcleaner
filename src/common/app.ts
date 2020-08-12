import { app, remote } from "electron";

export function currentApp(): Electron.App {
	return app ?? remote.app;
}

export function currentAppPath(): string {
	return currentApp().getAppPath();
}
