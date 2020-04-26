import path from "path";
import { remote } from "electron";
import { getPlatform, NIX, MAC, WIN } from "./get_platform";

const IS_PROD = process.env.NODE_ENV === "production";
const root = process.cwd();
const { isPackaged, getAppPath } = remote.app;

function getDevBinariesPath() {
	path.join(root, "./.resources", getPlatform(), "./bin");
}

function getProdBinariesPath() {
	const platform = getPlatform();

	switch (platform) {
		case WIN:
		case MAC:
			return path.join(
				path.dirname(getAppPath()),
				"..",
				"./Resources",
				"./bin"
			);
		case NIX:
			return path.join(
				path.dirname(getAppPath()),
				"..",
				"./resources",
				"./bin"
			);
		default:
			throw `Could not determine the production binary path for ExifTool on platform ${platform}`;
	}
}

function getBinariesPath() {
	return IS_PROD && isPackaged ? getProdBinariesPath() : getDevBinariesPath();
}

const binariesPath = getBinariesPath();

const BIN_FILENAME_WIN = "exiftool.exe";
const BIN_FILENAME_NIX_MAC = "exiftool";

function getBinFilename() {
	const platform = getPlatform();

	switch (platform) {
		case WIN:
			return BIN_FILENAME_WIN;
		case NIX:
		case MAC:
			return BIN_FILENAME_NIX_MAC;
		default:
			throw `Could not determine the ExifTool binary path for platform ${platform}`;
	}
}

const binFilename = getBinFilename();
export const exiftoolBinPath = path.resolve(
	path.join(binariesPath, binFilename)
);
