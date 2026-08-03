import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TARGET_VERSION = "13.59";

describe("ExifTool supply chain", () => {
	test("pins the official archives and verifies their SHA2-256 entries", () => {
		const updater = fs.readFileSync(
			path.join(ROOT, "update_exiftool.pl"),
			"utf8",
		);

		expect(updater).toContain(`EXIFTOOL_VERSION      => '${TARGET_VERSION}'`);
		expect(updater).toContain("'checksums-' . EXIFTOOL_VERSION . '.txt'");
		expect(updater).toContain(
			"'Image-ExifTool-' . EXIFTOOL_VERSION . '.tar.gz'",
		);
		expect(updater).toContain("'exiftool-' . EXIFTOOL_VERSION . '_32.zip'");
		expect(updater).toContain(
			"^SHA2-256\\($quoted_filename\\)= ([a-f0-9]{64})$",
		);
		expect(updater).toContain("( 'shasum', '-a', '256'");
		expect(updater).not.toMatch(/SHA1|checksums\.txt/);
	});

	test("vendors matching Unix and 32-bit-compatible Windows distributions", () => {
		const unixModule = fs.readFileSync(
			path.join(ROOT, ".resources/nix/bin/lib/Image/ExifTool.pm"),
			"utf8",
		);
		const windowsModule = fs.readFileSync(
			path.join(
				ROOT,
				".resources/win/bin/exiftool_files/lib/Image/ExifTool.pm",
			),
			"utf8",
		);
		const windowsExecutable = fs.readFileSync(
			path.join(ROOT, ".resources/win/bin/exiftool.exe"),
		);

		expect(unixModule).toMatch(/\$VERSION\s*=\s*'13\.59'/);
		expect(windowsModule).toMatch(/\$VERSION\s*=\s*'13\.59'/);
		expect(windowsExecutable.subarray(0, 2).toString("ascii")).toBe("MZ");

		const peOffset = windowsExecutable.readUInt32LE(0x3c);
		expect(windowsExecutable.subarray(peOffset, peOffset + 4)).toEqual(
			Buffer.from("PE\0\0", "binary"),
		);
		expect(windowsExecutable.readUInt16LE(peOffset + 4)).toBe(0x14c);
	});

	test.runIf(process.platform !== "win32")(
		"runs the vendored Unix distribution",
		() => {
			const version = execFileSync(
				path.join(ROOT, ".resources/nix/bin/exiftool"),
				["-ver"],
				{ encoding: "utf8" },
			).trim();

			expect(version).toBe(TARGET_VERSION);
		},
	);
});

describe("packaged Electron fuse policy", () => {
	test("configures exactly the three approved fuse changes", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
		) as {
			build: Record<string, unknown> & {
				electronFuses: Record<string, boolean>;
			};
		};

		expect(packageJson.build.electronFuses).toEqual({
			runAsNode: false,
			enableNodeOptionsEnvironmentVariable: false,
			enableNodeCliInspectArguments: false,
		});
		expect(packageJson.build).not.toHaveProperty("afterPack");
		expect(packageJson.build).toHaveProperty(
			"afterSign",
			"./scripts/afterPack.cjs",
		);
	});

	test("keeps final ad-hoc signing after electron-builder's fuse stage", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
		) as { build?: { mac?: { identity?: string | null } } };
		const hook = fs.readFileSync(
			path.join(ROOT, "scripts/afterPack.cjs"),
			"utf8",
		);

		expect(hook).toContain("function afterSign(context)");
		expect(hook).toContain("codesign --force --deep --sign -");
		expect(hook).not.toContain("process.env.CSC_LINK");
		expect(hook).not.toContain("process.env.CSC_NAME");
		expect(packageJson.build?.mac).toMatchObject({ identity: null });
	});
});
