import path from "path";
import { remote } from "electron";
import { getPlatform, Platform } from "./get_platform";

const IS_PROD = process.env.NODE_ENV === "production";
const { isPackaged, getAppPath } = remote.app;

enum PlatformSubpath {
	Win = "win",
	Nix = "nix"
}

function devBinaryPlatformSubpath(): PlatformSubpath {
	const platform = getPlatform();

	switch (platform) {
		case Platform.WIN:
			return PlatformSubpath.Win;
		case Platform.NIX:
		case Platform.MAC:
			return PlatformSubpath.Nix;
		default:
			throw `Could not determine dev Exiftool binary subpath for platform ${platform}`;
	}
}

function getDevBinariesPath(): string {
	return path.join(
		process.cwd(),
		"./.resources",
		devBinaryPlatformSubpath(),
		"./bin"
	);
}

enum ProdBinaryResourcesDirName {
	WinMac = "Resources",
	Linux = "resources"
}

function getProdBinariesPath(): string {
	const platform = getPlatform();
	const appPath = getAppPath();
	const appDir = path.dirname(appPath);

	let resourcesDirName;
	switch (platform) {
		case Platform.WIN:
			resourcesDirName = ProdBinaryResourcesDirName.WinMac;
			break;
		case Platform.MAC:
			resourcesDirName = ProdBinaryResourcesDirName.WinMac;
			break;
		case Platform.NIX:
			resourcesDirName = ProdBinaryResourcesDirName.Linux;
			break;
		default:
			throw `Could not determine the production binary path for ExifTool on platform ${platform}`;
	}

	return path.join(appDir, "..", resourcesDirName, "bin");
}

function getBinariesPath(): string {
	return IS_PROD && isPackaged ? getProdBinariesPath() : getDevBinariesPath();
}

enum BinFilename {
	Win = "exiftool.exe",
	Nix = "exiftool"
}

function getBinFilename(): string {
	const platform = getPlatform();

	switch (platform) {
		case Platform.WIN:
			return BinFilename.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinFilename.Nix;
		default:
			throw `Could not determine the ExifTool binary path for platform ${platform}`;
	}
}

const binFilename = getBinFilename();
export function exiftoolBinPath(): string {
	const binariesPath = getBinariesPath();

	return path.resolve(binariesPath, binFilename);
}
