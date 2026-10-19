// 63-05 (ADP-07, D-24): precondition that exifcleaner-node admits every native-path HEIC/AVIF
// fixture in all 8 preservation combos, both as committed and after the D-13 identifying seed on
// a temp copy. If a fixture stops being admitted, native tests would silently become ExifTool
// tests; this makes that loud.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeFile } from "exifcleaner-node";
import { afterEach, describe, expect, it } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { HEIF_SEED_ARGS, seedHeifCopy } from "../helpers/heif_seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const NATIVE_PATH_FIXTURES = [
	{ name: "sample-sips.heic", format: "heic" },
	{ name: "sample-sips.avif", format: "avif" },
	{ name: "sample-sips-icc.heic", format: "heic" },
	{ name: "sample-sips-icc.avif", format: "avif" },
	{ name: "sample-heifenc.heic", format: "heic" },
	{ name: "sample-heifenc.avif", format: "avif" },
	{ name: "grid-heifenc.heic", format: "heic" },
	{ name: "grid-heifenc.avif", format: "avif" },
] as const;

const COMBOS = Array.from({ length: 8 }, (_, mask) => ({
	mask,
	preserveOrientation: (mask & 1) !== 0,
	preserveColorProfile: (mask & 2) !== 0,
	preserveResolution: (mask & 4) !== 0,
}));

const CASES = NATIVE_PATH_FIXTURES.flatMap((fixture) =>
	COMBOS.map((combo) => ({ ...fixture, ...combo })),
);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("63-05: exifcleaner-node admits every native-path HEIF fixture (D-24)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeTempDir(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-admission-"));
		temporaryDirs.push(dir);
		return dir;
	}

	async function expectAdmitted({
		dir,
		name,
		format,
		mask,
		combo,
	}: {
		dir: string;
		name: string;
		format: "heic" | "avif";
		mask: number;
		combo: (typeof COMBOS)[number];
	}): Promise<void> {
		const source = path.join(dir, name);
		const destName = `out-${mask}-${name}`;
		const destination = path.join(dir, destName);
		const sourceDigest = sha256(source);
		const before = snapshotDir(dir);

		const result = await sanitizeFile({
			sourcePath: source,
			destinationPath: destination,
			preserveOrientation: combo.preserveOrientation,
			preserveColorProfile: combo.preserveColorProfile,
			preserveResolution: combo.preserveResolution,
			preserveTimestamps: false,
		});

		expect(
			result.ok,
			result.ok ? "admitted" : JSON.stringify(result.error),
		).toBe(true);
		if (!result.ok) return;
		expect(result.value.format).toBe(format);
		expect(sha256(source)).toBe(sourceDigest);
		assertDirEffect(before, snapshotDir(dir), {
			unchanged: [name],
			added: [destName],
			modified: [],
			removed: [],
		});
	}

	it.each(CASES)(
		"$name admitted natively as $format in combo $mask as committed",
		async ({ name, format, mask, ...flags }) => {
			const dir = makeTempDir();
			fs.copyFileSync(path.join(FIXTURES, name), path.join(dir, name));
			await expectAdmitted({
				dir,
				name,
				format,
				mask,
				combo: { mask, ...flags },
			});
		},
	);

	it.each(CASES)(
		"$name admitted natively as $format in combo $mask after the identifying seed",
		async ({ name, format, mask, ...flags }) => {
			const dir = makeTempDir();
			const source = path.join(dir, name);
			fs.copyFileSync(path.join(FIXTURES, name), source);
			seedHeifCopy({ exiftoolPath: EXIFTOOL_PATH, sourcePath: source });

			const seededTags = execFileSync(EXIFTOOL_PATH, [
				"-a",
				"-s3",
				source,
			]).toString();
			for (const marker of [
				"ZZ63-ARTIST",
				"ZZ63-COPYRIGHT",
				"ZZ63-MAKE",
				"ZZ63-MODEL",
				"ZZ63-CREATOR",
			]) {
				expect(seededTags).toContain(marker);
			}

			await expectAdmitted({
				dir,
				name,
				format,
				mask,
				combo: { mask, ...flags },
			});
		},
	);

	it.each(NATIVE_PATH_FIXTURES)(
		"$name commits no seed marker and no GPS (D-13)",
		({ name }) => {
			const dump = execFileSync(EXIFTOOL_PATH, [
				"-a",
				"-s3",
				"-G1",
				path.join(FIXTURES, name),
			]).toString();
			expect(dump).not.toContain("ZZ63-");
			const gps = execFileSync(EXIFTOOL_PATH, [
				"-a",
				"-s3",
				"-GPS:all",
				path.join(FIXTURES, name),
			])
				.toString()
				.trim();
			expect(gps).toBe("");
		},
	);

	it("seedHeifCopy refuses a file inside the committed fixtures directory", () => {
		expect(() =>
			seedHeifCopy({
				exiftoolPath: EXIFTOOL_PATH,
				sourcePath: path.join(FIXTURES, "sample-sips.heic"),
			}),
		).toThrow(/refuses/);
	});

	it("HEIF_SEED_ARGS keeps the date as a single argument", () => {
		expect(HEIF_SEED_ARGS).toContain("-DateTimeOriginal=2020:01:02 03:04:05");
	});
});
