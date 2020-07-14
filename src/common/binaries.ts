import path from "path";
import { getPlatform, Platform } from "./platform";
import { isProd } from "./env";
import { devResourcesPath, prodResourcesPath } from "./resources";

enum BinaryPlatformSubpath {
	Win = "win",
	Nix = "nix",
}

enum BinFilename {
	Win = "exiftool.exe",
	Nix = "exiftool",
}

function getBinariesPath(): string {
	return isProd() ? getProdBinariesPath() : getDevBinariesPath();
}

function getProdBinariesPath(): string {
	return path.join(prodResourcesPath(), "bin");
}

function getDevBinariesPath(): string {
	return path.join(devResourcesPath(), devBinaryPlatformSubpath(), "bin");
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
	const binariesPath = getBinariesPath();

	return path.resolve(binariesPath, getBinFilename());
}

export const exiftoolBinPath = getExifToolBinPath();
