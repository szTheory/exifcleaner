// Phase 52-04 (FID-03, D-35, D-37, D-38): modeled on tiff_private_tag_negative_control.test.ts
// -- real ExiftoolProcess + ExifToolAdapter, one mkdtemp per case, snapshotDir/assertDirEffect
// on each case dir. The matrix describe block proves every non-RAW writable format's ON output
// removes no less than OFF and adds only the source's own resolution; the oracle describe block
// proves resolutionDeltaViolations can actually fail; the edges block proves idempotency and the
// empty-input case. Every hand-written argument list in the oracle block is typed out in full,
// never spread from a product constant -- a vacuous pass here would defeat the point of a
// negative control.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { readRawTagLines } from "../helpers/raw_probe";
import {
	GENERIC_SEED_ARGS,
	JPEG_CONFLICT_RESOLUTION_ARGS,
	RESOLUTION_SENTINELS,
	resolutionDeltaViolations,
	seedFile,
	seededTagKeys,
} from "../helpers/resolution_probe";
import {
	JPEG_BOTH_300_ARGS,
	PNG_PHYS_SEED_ARGS,
	RESOLUTION_MATRIX_ROWS,
	materializeRow,
} from "../helpers/resolution_matrix";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("Resolution copy-back matrix, product adapter (FID-03, D-37, D-38)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each(RESOLUTION_MATRIX_ROWS)(
		"$ext ($fileType): ON removes no less than OFF and adds only the source's own resolution (FID-03, D-37, D-38)",
		async (row) => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "resolution-matrix-nc-"),
			);
			temporaryDirs.push(dir);
			const source = materializeRow(
				row,
				dir,
				`source${row.ext}`,
				EXIFTOOL_PATH,
			);
			const sourceDigestBefore = sha256(source);
			const onDest = path.join(dir, `on-out${row.ext}`);
			const offDest = path.join(dir, `off-out${row.ext}`);
			const before = snapshotDir(dir);

			const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const exiftool = new ExifToolAdapter({ process });
			await process.open();
			let onResult: Awaited<ReturnType<typeof exiftool.sanitize>>;
			let offResult: Awaited<ReturnType<typeof exiftool.sanitize>>;
			try {
				onResult = await exiftool.sanitize({
					source,
					destination: onDest,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				offResult = await exiftool.sanitize({
					source,
					destination: offDest,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: false,
					preserveTimestamps: false,
				});
			} finally {
				await process.close();
			}

			expect(sha256(source)).toBe(sourceDigestBefore);

			if (!row.writable) {
				// Measured (D-38c result-parity, never diagnostic-text matching): for a
				// format ExifTool refuses to write, writeMetadata's stdout is empty on
				// failure -- the refusal is diagnosed on a different channel entirely,
				// which this adapter deliberately never maps into ExifToolResult.error
				// (the same retired mechanism CLAUDE.md pins for the -CommonIFD0= write
				// warning). The adapter therefore reports { ok: true } with no destination
				// file written, identically for ON and OFF. What D-38 requires is parity
				// and an untouched source, not a specific `ok` value -- both hold here.
				expect(onResult).toEqual(offResult);
				expect(fs.existsSync(onDest)).toBe(false);
				expect(fs.existsSync(offDest)).toBe(false);
				const after = snapshotDir(dir);
				assertDirEffect(before, after, {
					added: [],
					modified: [],
					removed: [],
					unchanged: [path.basename(source)],
				});
				return;
			}

			expect(onResult).toEqual({ ok: true, value: undefined });
			expect(offResult).toEqual({ ok: true, value: undefined });

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(onDest), path.basename(offDest)],
				modified: [],
				removed: [],
				unchanged: [path.basename(source)],
			});

			const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);
			const onLines = readRawTagLines(onDest, EXIFTOOL_PATH);
			const offLines = readRawTagLines(offDest, EXIFTOOL_PATH);

			expect(seededTagKeys(onLines)).toEqual([]);
			const onSentinels = new Set(
				RESOLUTION_SENTINELS.filter((s) => fileContainsSentinel(onDest, s)),
			);
			const offSentinels = new Set(
				RESOLUTION_SENTINELS.filter((s) => fileContainsSentinel(offDest, s)),
			);
			for (const sentinel of onSentinels) {
				expect(offSentinels.has(sentinel)).toBe(true);
			}
			expect(
				resolutionDeltaViolations({
					source: sourceLines,
					off: offLines,
					on: onLines,
					companions: row.companions,
				}),
			).toEqual([]);
		},
	);
});

// 58-08 (ADP-02, ADP-04): residue directories are exifcleaner-node's own atomic-publication
// staging leftovers for a native write -- discovered at runtime (mirrors the identical helper
// in native_copy_routing.test.ts) so this stays a no-op on platforms where disposal succeeds.
function residueEntries(dir: string): string[] {
	return fs
		.readdirSync(dir)
		.filter((name) => name.startsWith(".exifcleaner-stage-"));
}

// 58-08 (ADP-02, ADP-04): the same matrix rows as the ExifTool-only block above, but driven
// through the real HybridMetadataEngine (real ExiftoolProcess + real NativeMetadataAdapter,
// vi.spyOn tracking call counts only -- never mocking the engines themselves) so the NC gate
// proves the native PNG/JPEG copy path and the WebP ExifTool/native split, not just ExifTool's
// own writer. jpg/jpeg/png preserve resolution natively (HybridMetadataEngine routes both ON
// and OFF to native); webp does not preserve resolution natively, so ON (preserveResolution
// true) is native-ineligible and routes to ExifTool, while OFF (preserveResolution false)
// bypasses the resolution gate and routes to native (D-01, D-03, 58-01).
const HYBRID_MATRIX_ROWS = RESOLUTION_MATRIX_ROWS.filter((row) =>
	([".jpg", ".jpeg", ".png", ".webp"] as readonly string[]).includes(row.ext),
);

describe("Resolution copy-back matrix, hybrid engine (ADP-02, ADP-04)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each(HYBRID_MATRIX_ROWS)(
		"$ext ($fileType) through the hybrid engine: ON removes no less than OFF and adds only the source's own resolution (ADP-02, ADP-04)",
		async (row) => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "resolution-matrix-hybrid-"),
			);
			temporaryDirs.push(dir);
			const source = materializeRow(
				row,
				dir,
				`source${row.ext}`,
				EXIFTOOL_PATH,
			);
			const sourceDigestBefore = sha256(source);
			const onDest = path.join(dir, `on-out${row.ext}`);
			const offDest = path.join(dir, `off-out${row.ext}`);
			const before = snapshotDir(dir);

			const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const exiftool = new ExifToolAdapter({ process });
			const native = new NativeMetadataAdapter();
			const hybrid = new HybridMetadataEngine({ exiftool, native });
			const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
			const nativeWrite = vi.spyOn(native, "sanitize");

			await process.open();
			let onResult: Awaited<ReturnType<typeof hybrid.sanitize>>;
			let offResult: Awaited<ReturnType<typeof hybrid.sanitize>>;
			try {
				onResult = await hybrid.sanitize({
					source,
					destination: onDest,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				offResult = await hybrid.sanitize({
					source,
					destination: offDest,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: false,
					preserveTimestamps: false,
				});
			} finally {
				await process.close();
			}

			expect(sha256(source)).toBe(sourceDigestBefore);
			expect(onResult).toMatchObject({ ok: true });
			expect(offResult).toMatchObject({ ok: true });

			if (row.ext === ".webp") {
				expect(exiftoolWrite).toHaveBeenCalledOnce();
				expect(nativeWrite).toHaveBeenCalledOnce();
			} else {
				expect(nativeWrite).toHaveBeenCalledTimes(2);
				expect(exiftoolWrite).not.toHaveBeenCalled();
			}

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [
					path.basename(onDest),
					path.basename(offDest),
					...residueEntries(dir),
				],
				modified: [],
				removed: [],
				unchanged: [path.basename(source)],
			});

			const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);
			const onLines = readRawTagLines(onDest, EXIFTOOL_PATH);
			const offLines = readRawTagLines(offDest, EXIFTOOL_PATH);

			expect(seededTagKeys(onLines)).toEqual([]);

			if (row.ext === ".webp") {
				const onXResolution = onLines.find(
					(line) => line.key === "IFD0:XResolution",
				);
				expect(onXResolution?.value).toBe("300");
			}

			expect(
				resolutionDeltaViolations({
					source: sourceLines,
					off: offLines,
					on: onLines,
					companions: row.companions,
				}),
			).toEqual([]);
		},
	);
});

function fileContainsSentinel(filePath: string, sentinel: string): boolean {
	const raw = fs.readFileSync(filePath);
	return (
		raw.toString("latin1").includes(sentinel) ||
		raw.toString("utf16le").includes(sentinel)
	);
}

describe("Resolution oracle negative control (D-35)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("the superseded bare F-3 argument list drops JFIF resolution on a conflicting-DPI JPEG (D-35)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-oracle-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "conflict.jpg");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.jpg"),
			source,
		);
		seedFile(
			source,
			EXIFTOOL_PATH,
			[...JPEG_CONFLICT_RESOLUTION_ARGS, ...GENERIC_SEED_ARGS],
			{ "JFIF:XResolution": "300", "IFD0:XResolution": "72" },
		);
		const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);

		const offSrc = path.join(dir, "off-src.jpg");
		fs.copyFileSync(source, offSrc);
		const offOut = path.join(dir, "off-out.jpg");
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			offOut,
			offSrc,
		]);

		const onSrc = path.join(dir, "on-src.jpg");
		fs.copyFileSync(source, onSrc);
		const onOut = path.join(dir, "on-out-baref3.jpg");
		// The superseded EVIDENCE F-3 argument list -- bare, non-group-qualified tag names.
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-XResolution",
			"-YResolution",
			"-ResolutionUnit",
			"-PNG:PixelsPerUnitX",
			"-PNG:PixelsPerUnitY",
			"-PNG:PixelUnits",
			"-o",
			onOut,
			onSrc,
		]);

		const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
		const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
		const violations = resolutionDeltaViolations({
			source: sourceLines,
			off: offLines,
			on: onLines,
			companions: [
				"File:ExifByteOrder",
				"JFIF:JFIFVersion",
				"IFD0:YCbCrPositioning",
			],
		});
		expect(violations).toContain("lost:JFIF:XResolution");
	});

	it("the superseded bare F-3 argument list synthesizes an IFD0 block on a JFIF-only JPEG (D-35)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-oracle-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "jfifonly.jpg");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/no_metadata.jpg"),
			source,
		);
		execFileSync(EXIFTOOL_PATH, [
			"-overwrite_original",
			"-JFIF:XResolution=300",
			"-JFIF:YResolution=300",
			"-JFIF:ResolutionUnit=inches",
			"-Comment=ZZP52-COMMENT",
			"-XMP-tiff:Artist=ZZP52-ARTIST",
			"-XMP-tiff:Software=ZZP52-SOFT",
			"-XMP-exif:GPSLatitude=37.7749",
			source,
		]);
		const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);

		const offSrc = path.join(dir, "off-src.jpg");
		fs.copyFileSync(source, offSrc);
		const offOut = path.join(dir, "off-out.jpg");
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			offOut,
			offSrc,
		]);

		const onSrc = path.join(dir, "on-src.jpg");
		fs.copyFileSync(source, onSrc);
		const onOut = path.join(dir, "on-out-baref3.jpg");
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-XResolution",
			"-YResolution",
			"-ResolutionUnit",
			"-PNG:PixelsPerUnitX",
			"-PNG:PixelsPerUnitY",
			"-PNG:PixelUnits",
			"-o",
			onOut,
			onSrc,
		]);

		const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
		const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
		const violations = resolutionDeltaViolations({
			source: sourceLines,
			off: offLines,
			on: onLines,
			companions: ["JFIF:JFIFVersion"],
		});
		expect(violations).toContain("synthesized:IFD0:XResolution");
	});

	it("an injected unrequested tag is flagged (D-35)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-oracle-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "both.jpg");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.jpg"),
			source,
		);
		seedFile(
			source,
			EXIFTOOL_PATH,
			[...JPEG_BOTH_300_ARGS, ...GENERIC_SEED_ARGS],
			{ "IFD0:XResolution": "300", "IFD0:Artist": "ZZP52-ARTIST" },
		);
		const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);

		const offSrc = path.join(dir, "off-src.jpg");
		fs.copyFileSync(source, offSrc);
		const offOut = path.join(dir, "off-out.jpg");
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			offOut,
			offSrc,
		]);

		const onSrc = path.join(dir, "on-src.jpg");
		fs.copyFileSync(source, onSrc);
		const onOut = path.join(dir, "on-out-injected.jpg");
		// Product ON list plus one extra, unrequested token: -IFD0:Artist>IFD0:Artist.
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-JFIF:XResolution>JFIF:XResolution",
			"-JFIF:YResolution>JFIF:YResolution",
			"-JFIF:ResolutionUnit>JFIF:ResolutionUnit",
			"-IFD0:XResolution>IFD0:XResolution",
			"-IFD0:YResolution>IFD0:YResolution",
			"-IFD0:ResolutionUnit>IFD0:ResolutionUnit",
			"-PNG:PixelsPerUnitX>PNG:PixelsPerUnitX",
			"-PNG:PixelsPerUnitY>PNG:PixelsPerUnitY",
			"-PNG:PixelUnits>PNG:PixelUnits",
			"-IFD0:Artist>IFD0:Artist",
			"-o",
			onOut,
			onSrc,
		]);

		const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
		const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
		const violations = resolutionDeltaViolations({
			source: sourceLines,
			off: offLines,
			on: onLines,
			companions: [
				"File:ExifByteOrder",
				"JFIF:JFIFVersion",
				"IFD0:YCbCrPositioning",
			],
		});
		expect(violations).toContain("unrequested:IFD0:Artist");
	});

	it("a cross-group relocation is flagged as synthesized (D-35)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-oracle-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "both.jpg");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.jpg"),
			source,
		);
		seedFile(
			source,
			EXIFTOOL_PATH,
			[...JPEG_BOTH_300_ARGS, ...GENERIC_SEED_ARGS],
			{ "IFD0:XResolution": "300", "IFD0:Artist": "ZZP52-ARTIST" },
		);
		const sourceLines = readRawTagLines(source, EXIFTOOL_PATH);

		const offSrc = path.join(dir, "off-src.jpg");
		fs.copyFileSync(source, offSrc);
		const offOut = path.join(dir, "off-out.jpg");
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			offOut,
			offSrc,
		]);

		const onSrc = path.join(dir, "on-src.jpg");
		fs.copyFileSync(source, onSrc);
		const onOut = path.join(dir, "on-out-relocated.jpg");
		// Product ON list plus one extra, cross-group relocation token.
		execFileSync(EXIFTOOL_PATH, [
			"-all=",
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-JFIF:XResolution>JFIF:XResolution",
			"-JFIF:YResolution>JFIF:YResolution",
			"-JFIF:ResolutionUnit>JFIF:ResolutionUnit",
			"-IFD0:XResolution>IFD0:XResolution",
			"-IFD0:YResolution>IFD0:YResolution",
			"-IFD0:ResolutionUnit>IFD0:ResolutionUnit",
			"-PNG:PixelsPerUnitX>PNG:PixelsPerUnitX",
			"-PNG:PixelsPerUnitY>PNG:PixelsPerUnitY",
			"-PNG:PixelUnits>PNG:PixelUnits",
			"-IFD0:XResolution>XMP-tiff:XResolution",
			"-o",
			onOut,
			onSrc,
		]);

		const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
		const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
		const violations = resolutionDeltaViolations({
			source: sourceLines,
			off: offLines,
			on: onLines,
			companions: [
				"File:ExifByteOrder",
				"JFIF:JFIFVersion",
				"IFD0:YCbCrPositioning",
			],
		});
		expect(violations).toContain("synthesized:XMP-tiff:XResolution");
	});
});

describe("Resolution copy-back edges (FID-01, FID-03)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("re-cleaning an ON output with ON again changes nothing (idempotency)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-idem-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "both.jpg");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.jpg"),
			source,
		);
		seedFile(
			source,
			EXIFTOOL_PATH,
			[...JPEG_BOTH_300_ARGS, ...GENERIC_SEED_ARGS],
			{ "IFD0:XResolution": "300", "IFD0:Artist": "ZZP52-ARTIST" },
		);
		const firstOut = path.join(dir, "first.jpg");
		const secondOut = path.join(dir, "second.jpg");

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		await process.open();
		try {
			const first = await exiftool.sanitize({
				source,
				destination: firstOut,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(first).toEqual({ ok: true, value: undefined });
			const second = await exiftool.sanitize({
				source: firstOut,
				destination: secondOut,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(second).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}

		expect(readRawTagLines(secondOut, EXIFTOOL_PATH)).toEqual(
			readRawTagLines(firstOut, EXIFTOOL_PATH),
		);
	});

	it("re-cleaning a PNG's ON output with ON again changes nothing (idempotency)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-idem-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "phys.png");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.png"),
			source,
		);
		seedFile(source, EXIFTOOL_PATH, [...PNG_PHYS_SEED_ARGS], {
			"PNG-pHYs:PixelsPerUnitX": "11811",
		});
		const firstOut = path.join(dir, "first.png");
		const secondOut = path.join(dir, "second.png");

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		await process.open();
		try {
			const first = await exiftool.sanitize({
				source,
				destination: firstOut,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(first).toEqual({ ok: true, value: undefined });
			const second = await exiftool.sanitize({
				source: firstOut,
				destination: secondOut,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(second).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}

		expect(readRawTagLines(secondOut, EXIFTOOL_PATH)).toEqual(
			readRawTagLines(firstOut, EXIFTOOL_PATH),
		);
	});

	it("a PNG with no pHYs gains none, and the toggle is a no-op on an empty resolution input (FID-01, FID-03)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolution-empty-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "sample.png");
		fs.copyFileSync(
			path.resolve(__dirname, "../e2e/fixtures/sample.png"),
			source,
		);
		const onOut = path.join(dir, "on.png");

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		await process.open();
		try {
			const result = await exiftool.sanitize({
				source,
				destination: onOut,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(result).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}

		const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
		expect(onLines.some((line) => line.key.startsWith("PNG-pHYs:"))).toBe(
			false,
		);
	});
});
