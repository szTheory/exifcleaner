// 63-06 (ADP-07, ADP-08, D-13, D-17): ExifTool-path HEIC/AVIF fixtures. Each is DECLINED by
// exifcleaner-node 0.4.0 before any write (phase "admission", nativeWrite "not-started") with a
// measured public code, so a node change that starts admitting one fails here loudly instead of
// silently switching the engine that the downstream tests think they are exercising.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFallback, sanitizeFile } from "exifcleaner-node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

// expectedCode values were MEASURED by running node 0.4.0 on each file (63-EVIDENCE.md).
const EXIFTOOL_PATH_FIXTURES = [
	{
		name: "QuickTime.heic",
		expectedCode: "unsupported-format",
		handler: "",
	},
	{
		name: "red-at-12-oclock-with-color-profile-lossy.avif",
		expectedCode: "unsafe-structure",
		handler: "cavif - https://github.com/link-u/cavif",
	},
	{
		name: "sample-sips-icc-declined.heic",
		expectedCode: "unsupported-format",
		handler: "",
	},
	{
		name: "sample-sips-icc-declined.avif",
		expectedCode: "unsupported-format",
		handler: "",
	},
] as const;

// F-HEIC-ICC fixtures: ICC-bearing, declined by node, empty handler (D-17).
const ICC_RESIDUE_FIXTURES = [
	{ name: "sample-sips-icc-declined.heic", fileType: "HEIC" },
	{ name: "sample-sips-icc-declined.avif", fileType: "AVIF" },
] as const;

const COMBOS = Array.from({ length: 8 }, (_, mask) => ({
	mask,
	preserveOrientation: (mask & 1) !== 0,
	preserveColorProfile: (mask & 2) !== 0,
	preserveResolution: (mask & 4) !== 0,
}));

const DECLINE_CASES = EXIFTOOL_PATH_FIXTURES.flatMap((fixture) =>
	COMBOS.map((combo) => ({ ...fixture, ...combo })),
);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("63-06: ExifTool-path HEIF fixtures are declined by exifcleaner-node (inverse D-24)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeTempDir(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-exiftool-path-"));
		temporaryDirs.push(dir);
		return dir;
	}

	it.each(DECLINE_CASES)(
		"$name declined pre-write as $expectedCode in combo $mask with a fallback grant",
		async ({ name, expectedCode, mask, ...flags }) => {
			const dir = makeTempDir();
			const source = path.join(dir, name);
			fs.copyFileSync(path.join(FIXTURES, name), source);
			const destName = `out-${mask}-${name}`;
			const destination = path.join(dir, destName);
			const sourceDigest = sha256(source);
			const before = snapshotDir(dir);

			const result = await sanitizeFile({
				sourcePath: source,
				destinationPath: destination,
				preserveOrientation: flags.preserveOrientation,
				preserveColorProfile: flags.preserveColorProfile,
				preserveResolution: flags.preserveResolution,
				preserveTimestamps: false,
			});

			expect(result.ok, "node must decline an ExifTool-path fixture").toBe(
				false,
			);
			if (result.ok) return;
			expect(result.error.code).toBe(expectedCode);
			expect(result.error.phase).toBe("admission");
			expect(result.error.nativeWrite).toBe("not-started");
			expect(classifyFallback(result.error)).toBe("safe-to-fallback");
			expect(fs.existsSync(destination)).toBe(false);
			expect(sha256(source)).toBe(sourceDigest);
			assertDirEffect(before, snapshotDir(dir), {
				unchanged: [name],
				added: [],
				modified: [],
				removed: [],
			});
		},
	);

	it.each(EXIFTOOL_PATH_FIXTURES)(
		"$name pins its QuickTime:HandlerDescription as measured (D-17)",
		({ name, handler }) => {
			const output = execFileSync(EXIFTOOL, [
				"-G1",
				"-s",
				"-HandlerDescription",
				path.join(FIXTURES, name),
			])
				.toString()
				.trim();
			if (handler === "") {
				expect(output).toBe("");
			} else {
				expect(output).toBe(
					`[QuickTime]     HandlerDescription              : ${handler}`,
				);
			}
		},
	);

	describe("ExifTool clean keeps ICC on the constructed fixtures (F-HEIC-ICC, D-17)", () => {
		const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL });
		const adapter = new ExifToolAdapter({ process: exiftoolProcess });

		beforeAll(async () => {
			await exiftoolProcess.open();
		});
		afterAll(async () => {
			await exiftoolProcess.close();
		});

		function iccKeys(filePath: string): string[] {
			return execFileSync(EXIFTOOL, ["-a", "-G1", "-s", filePath])
				.toString()
				.split("\n")
				.filter((line) => /^\[(ICC-header|ICC_Profile)\]/.test(line));
		}

		function handlerOf(filePath: string): string {
			return execFileSync(EXIFTOOL, [
				"-a",
				"-s3",
				"-HandlerDescription",
				filePath,
			])
				.toString()
				.trim();
		}

		it.each(ICC_RESIDUE_FIXTURES)(
			"$name: input has ICC and an empty handler, ExifTool writes it with preserveColorProfile=false and ICC remains",
			async ({ name, fileType }) => {
				const dir = makeTempDir();
				const source = path.join(dir, name);
				fs.copyFileSync(path.join(FIXTURES, name), source);
				const destName = `cleaned-${name}`;
				const destination = path.join(dir, destName);
				const sourceDigest = sha256(source);
				expect(iccKeys(source).length).toBeGreaterThan(0);
				expect(handlerOf(source)).toBe("");
				const before = snapshotDir(dir);

				const result = await adapter.sanitize({
					source,
					destination,
					outputMode: "copy",
					preserveOrientation: false,
					preserveColorProfile: false,
					preserveResolution: false,
					preserveTimestamps: false,
				});

				expect(result).toEqual({
					ok: true,
					value: { writtenBy: "exiftool" },
				});
				expect(
					execFileSync(EXIFTOOL, ["-s3", "-FileType", destination])
						.toString()
						.trim(),
				).toBe(fileType);
				expect(iccKeys(destination).length).toBeGreaterThan(0);
				expect(handlerOf(destination)).toBe("");
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [destName],
					modified: [],
					removed: [],
				});
			},
		);

		it("red.avif keeps a non-empty handler (fail-closed control, D-17)", () => {
			expect(
				handlerOf(
					path.join(FIXTURES, "red-at-12-oclock-with-color-profile-lossy.avif"),
				),
			).not.toBe("");
		});
	});
});
