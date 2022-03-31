import path from "path";
import { isProd } from "./env.js";

const ICON_FILENAME = "icon.png";
const CHECKMARK_FILENAME = "check.png";

const DevResourcesDirName = ".resources";

export function resourcesPath(): string {
	return isProd()
		? process.resourcesPath
		: path.join(process.cwd(), DevResourcesDirName);
}

export function iconPath(): string {
	const basePath = path.join(resourcesPath(), ICON_FILENAME);
	// Fix for Linux
	const pathFixed = basePath.replace(/\\/g, "\\\\");

	return pathFixed;
}

export function checkmarkPath(): string {
	return path.join(resourcesPath(), CHECKMARK_FILENAME);
}
