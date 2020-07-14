import path from "path";
import { app } from "electron";
import { getPlatform, Platform } from "./platform";

export enum ProdResourcesDirName {
	WinMac = "Resources",
	Linux = "resources",
}
export const DevResourcesDirName = ".resources";

export function prodResourcesPath(): string {
	const platform = getPlatform();
	const appPath = app.getAppPath();
	const appDir = path.dirname(appPath);

	let resourcesDirName;
	switch (platform) {
		case Platform.WIN:
			resourcesDirName = ProdResourcesDirName.WinMac;
			break;
		case Platform.MAC:
			resourcesDirName = ProdResourcesDirName.WinMac;
			break;
		case Platform.NIX:
			resourcesDirName = ProdResourcesDirName.Linux;
			break;
		default:
			throw `Could not determine the production binary path for ExifTool on platform ${platform}`;
	}

	return path.join(appDir, "..", resourcesDirName);
}

export function devResourcesPath(): string {
	return path.join(process.cwd(), ".resources");
}
