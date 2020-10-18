import path from "path";
import { isProd } from "./env";

const ICON_FILENAME = "icon.png";
const CHECKMARK_FILENAME = "check.png";

const DevResourcesDirName = ".resources";

export function resourcesPath(): string {
	return isProd()
		? process.resourcesPath
		: path.join(process.cwd(), DevResourcesDirName);
}

export function iconPath(): string {
	return path.join(resourcesPath(), ICON_FILENAME);
}

export function checkmarkPath(): string {
	return path.join(resourcesPath(), CHECKMARK_FILENAME);
}
