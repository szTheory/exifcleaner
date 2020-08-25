import path from "path";
import { getPlatform, Platform } from "./platform";
import { currentAppPath } from "./app";
import { isProd } from "./env";

const ICON_FILENAME = "icon.png";
const CHECKMARK_FILENAME = "check.png";

export enum ProdResourcesDirName {
	WinMac = "Resources",
	Linux = "resources",
}
export const DevResourcesDirName = ".resources";

export function prodResourcesPath(): string {
	const platform = getPlatform();
	const appPath = currentAppPath();
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

export function envResourcesPath(): string {
	return isProd() ? prodResourcesPath() : devResourcesPath();
}

export function iconPath(): string {
	return path.join(envResourcesPath(), ICON_FILENAME);
}

export function checkmarkPath(): string {
	return path.join(envResourcesPath(), CHECKMARK_FILENAME);
}
