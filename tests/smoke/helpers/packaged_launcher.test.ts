import path from "node:path";
import { describe, expect, test } from "vitest";
import { packagedExiftoolPath } from "./packaged_launcher";

describe("packagedExiftoolPath", () => {
	test("resolves ExifTool only from the running artifact resources", () => {
		const resourcesPath = path.join("/installed", "ExifCleaner", "resources");
		const exiftoolPath = packagedExiftoolPath(resourcesPath, "linux");

		expect(exiftoolPath).toBe(
			path.join(resourcesPath, "nix", "bin", "exiftool"),
		);
		expect(exiftoolPath.startsWith(resourcesPath)).toBe(true);
	});
});
