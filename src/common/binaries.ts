import path from "path";
import { getPlatform, Platform } from "./platform";
import { isProd } from "./env";
import { resourcesPath } from "./resources";

enum BinaryPlatformSubpath {
	Win = "win",
	Nix = "nix",
}

enum BinFilename {
	Win = "exiftool.exe",
	Nix = "exiftool",
}

function binariesPath(): string {
	return isProd() ? binariesPathProd() : binariesPathDev();
}

function binariesPathProd(): string {
	return path.join(resourcesPath(), "bin");
}

function binariesPathDev(): string {
	return path.join(resourcesPath(), devBinaryPlatformSubpath(), "bin");
}

function devBinaryPlatformSubpath(): BinaryPlatformSubpath {
	const platform = getPlatform();

	switch (getPlatform()) {
		case Platform.WIN:
			return BinaryPlatformSubpath.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinaryPlatformSubpath.Nix;
		default:
			throw `Could not determine dev Exiftool binary subpath for platform ${platform}`;
	}
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

function getExifToolBinPath(): string {
	return path.resolve(binariesPath(), getBinFilename());
}

export const exiftoolBinPath = getExifToolBinPath();
