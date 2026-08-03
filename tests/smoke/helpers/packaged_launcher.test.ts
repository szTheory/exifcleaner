import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	packagedExiftoolPath,
	packagedFuseExecutablePath,
} from "./packaged_launcher";

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

describe("packagedFuseExecutablePath", () => {
	test("resolves the fuse-bearing binary behind an extracted AppImage AppRun", () => {
		expect(
			packagedFuseExecutablePath(
				path.join("/tmp", "squashfs-root", "AppRun"),
				"linux",
			),
		).toBe(path.join("/tmp", "squashfs-root", "exifcleaner"));
	});

	test("resolves the fuse-bearing framework binary inside a macOS bundle", () => {
		const executable = path.join(
			"/installed",
			"ExifCleaner.app",
			"Contents",
			"MacOS",
			"ExifCleaner",
		);
		expect(packagedFuseExecutablePath(executable, "darwin")).toBe(
			path.join(
				"/installed",
				"ExifCleaner.app",
				"Contents",
				"Frameworks",
				"Electron Framework.framework",
				"Electron Framework",
			),
		);
	});

	test("uses the installed executable directly on Windows", () => {
		const executable = path.join("installed", "ExifCleaner.exe");
		expect(packagedFuseExecutablePath(executable, "win32")).toBe(executable);
	});
});
