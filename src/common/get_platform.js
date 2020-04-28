import { platform } from "os";

export const NIX = "nix";
export const MAC = "mac";
export const WIN = "win";

export function getPlatform() {
	const currentPlatform = platform();

	switch (currentPlatform) {
		case "aix":
		case "freebsd":
		case "linux":
		case "openbsd":
		case "android":
		case "sunos":
			return NIX;
		case "darwin":
			return MAC;
		case "win32":
			return WIN;
		default:
			throw `Did not recognize platform ${currentPlatform}`;
	}
}
