import path from "path";
import { getPlatform, Platform } from "../../common";
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
	return path.join(resourcesPath(), binaryPlatformSubpath(), "bin");
}

function binaryPlatformSubpath(): BinaryPlatformSubpath {
	const platform = getPlatform();

	switch (getPlatform()) {
		case Platform.WIN:
			return BinaryPlatformSubpath.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinaryPlatformSubpath.Nix;
		default:
			throw new Error(
				`Could not determine dev Exiftool binary subpath for platform ${platform}`,
			);
	}
}

function binaryFilename(): string {
	const platform = getPlatform();

	switch (platform) {
		case Platform.WIN:
			return BinFilename.Win;
		case Platform.NIX:
		case Platform.MAC:
			return BinFilename.Nix;
		default:
			throw new Error(
				`Could not determine the ExifTool binary path for platform ${platform}`,
			);
	}
}

function getExifToolBinPath(): string {
	return path.resolve(binariesPath(), binaryFilename());
}

export const exiftoolBinPath = getExifToolBinPath();

/**
 * Absolute path of the packaged POSIX parent-death watchdog config (LIF-01, D-03).
 *
 * Resolved only from `resourcesPath()`: never from settings, environment variables or argv,
 * because ExifTool executes this file as Perl. There is deliberately no existence check or
 * fallback spawn (D-05): if the file is missing ExifTool itself warns `Config file not found`,
 * which reaches console.warn through the existing stderr path. The spawn builder ignores it
 * on Windows.
 */
// prettier-ignore
export const exiftoolConfigPath = path.resolve(resourcesPath(), "nix", "exiftool-config", "watchdog.config");
