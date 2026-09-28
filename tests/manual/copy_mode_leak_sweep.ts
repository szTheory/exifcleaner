// Phase 58-03 (D-08): the measured two-engine copy-mode leak sweep. Run with:
//   ASDF_NODEJS_VERSION=22.14.0 yarn tsx tests/manual/copy_mode_leak_sweep.ts --output <path>
//
// This is deliberately NOT a vitest test (no `.test.ts` suffix) and is NOT run in CI -- a
// one-time local measurement script, invoked manually to (re)produce the sweep record that
// backs `.planning/phases/58-app-adoption/58-SWEEP-MATRIX.md` and
// `tests/domain/fixtures/copy_mode_leak_sweep.json`. `verify:direffect`
// (scripts/dir_effect_gate.mjs) only collects `tests/**/*.test.ts`, `.spec.ts` and `.smoke.ts`
// files by construction, so this file is out of its scope without an exemption entry, exactly
// like tests/manual/large_file_limits_probe.ts (Phase 53).
//
// It drives the REAL ExiftoolProcess + ExifToolAdapter and the REAL NativeMetadataAdapter
// (exifcleaner-node), writing every variant only inside an mkdtemp scratch directory -- never
// into tests/e2e/fixtures.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EXIFTOOL_PATH = path.join(REPO_ROOT, ".resources/nix/bin/exiftool");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests/e2e/fixtures");

// -----------------------------------------------------------------------------------------
// CLI args
// -----------------------------------------------------------------------------------------

function parseOutputArg(): string {
	const idx = process.argv.indexOf("--output");
	if (idx === -1 || process.argv[idx + 1] === undefined) {
		throw new Error("Usage: copy_mode_leak_sweep.ts --output <path>");
	}
	return path.resolve(process.argv[idx + 1]!);
}

// -----------------------------------------------------------------------------------------
// Small binary builders -- PNG chunks / JPEG segments ExifTool cannot write directly
// (measured: -listw rejects WhitePointX/RedX/.../SRGBRendering/BackgroundColor/
// SignificantBits on PNG, and there is no writable APP14:* tag group for JPEG).
// -----------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

interface PngChunk {
	readonly type: string;
	readonly data: Buffer;
}

function readPngChunks(buf: Buffer): PngChunk[] {
	const chunks: PngChunk[] = [];
	let offset = 8;
	while (offset < buf.length) {
		const length = buf.readUInt32BE(offset);
		const type = buf.toString("ascii", offset + 4, offset + 8);
		const data = buf.subarray(offset + 8, offset + 8 + length);
		chunks.push({ type, data });
		offset += 8 + length + 4;
	}
	return chunks;
}

function writePngChunks(chunks: readonly PngChunk[]): Buffer {
	const parts: Buffer[] = [PNG_SIGNATURE];
	for (const { type, data } of chunks) {
		const lengthBuf = Buffer.alloc(4);
		lengthBuf.writeUInt32BE(data.length, 0);
		const typeBuf = Buffer.from(type, "ascii");
		const crc = zlib.crc32(Buffer.concat([typeBuf, data]));
		const crcBuf = Buffer.alloc(4);
		crcBuf.writeUInt32BE(crc >>> 0, 0);
		parts.push(lengthBuf, typeBuf, data, crcBuf);
	}
	return Buffer.concat(parts);
}

// Inserts ancillary chunks at the semantically correct spot: colour/gamma-shaped chunks
// (cHRM, sRGB, sBIT) right after the last existing pre-PLTE ancillary chunk (or IHDR), and
// post-palette chunks (bKGD, tRNS) right before IDAT -- matching the PNG spec's chunk
// ordering rules closely enough for both ExifTool and exifcleaner-node to parse cleanly.
function insertPngAncillaryChunks(
	buf: Buffer,
	beforePlteChunks: readonly PngChunk[],
	beforeIdatChunks: readonly PngChunk[],
): Buffer {
	const chunks = readPngChunks(buf);
	const idatIdx = chunks.findIndex((c) => c.type === "IDAT");
	const plteIdx = chunks.findIndex((c) => c.type === "PLTE");
	const beforePlteInsertAt = plteIdx === -1 ? 1 : plteIdx;
	const withPreChunks = [
		...chunks.slice(0, beforePlteInsertAt),
		...beforePlteChunks,
		...chunks.slice(beforePlteInsertAt),
	];
	const idatIdx2 = withPreChunks.findIndex((c) => c.type === "IDAT");
	const insertAt2 = idatIdx2 === -1 ? withPreChunks.length - 1 : idatIdx2;
	const final = [
		...withPreChunks.slice(0, insertAt2),
		...beforeIdatChunks,
		...withPreChunks.slice(insertAt2),
	];
	void idatIdx;
	return writePngChunks(final);
}

function be32(value: number): Buffer {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(value >>> 0, 0);
	return b;
}

function buildGammaChromaSrgbSignificantChunks(): {
	beforePlte: PngChunk[];
	beforeIdat: PngChunk[];
} {
	// cHRM: white/red/green/blue x,y as PNG-int (value * 100000), 8 * 4 bytes.
	const chrmValues = [
		0.3127, 0.329, // white
		0.64, 0.33, // red
		0.3, 0.6, // green
		0.15, 0.06, // blue
	].map((v) => Math.round(v * 100000));
	const chrmData = Buffer.concat(chrmValues.map((v) => be32(v)));

	// sRGB: 1-byte rendering intent (0 = perceptual).
	const srgbData = Buffer.from([0x00]);

	// sBIT: for an 8-bit RGB (colorType 2) source, one byte per channel.
	const sbitData = Buffer.from([0x08, 0x08, 0x08]);

	// bKGD: for colorType 2, 2 bytes per channel (R,G,B), high byte first.
	const bkgdData = Buffer.from([0x00, 0xff, 0x00, 0xff, 0x00, 0xff]);

	// tRNS: for colorType 2, 2 bytes per channel (R,G,B) transparent colour.
	const trnsData = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

	return {
		beforePlte: [
			{ type: "cHRM", data: chrmData },
			{ type: "sRGB", data: srgbData },
			{ type: "sBIT", data: sbitData },
		],
		beforeIdat: [
			{ type: "bKGD", data: bkgdData },
			{ type: "tRNS", data: trnsData },
		],
	};
}

// Fully synthetic 1x1 palette PNG (colorType 3) with a 1-entry PLTE and a matching tRNS --
// no fixture base, since sample.png is truecolor (colorType 2) and ExifTool cannot re-encode
// a PNG's pixel format.
function buildSyntheticPalettePng(): Buffer {
	const ihdrData = Buffer.concat([
		be32(1), // width
		be32(1), // height
		Buffer.from([8, 3, 0, 0, 0]), // bitDepth=8, colorType=3, compression/filter/interlace=0
	]);
	const plteData = Buffer.from([0xff, 0x00, 0x00]); // single palette entry: red
	const trnsData = Buffer.from([0x80]); // that entry is semi-transparent
	// One scanline: filter byte (0 = none) + one palette-index byte (0).
	const idatRaw = Buffer.from([0x00, 0x00]);
	const idatData = zlib.deflateSync(idatRaw);
	return writePngChunks([
		{ type: "IHDR", data: ihdrData },
		{ type: "PLTE", data: plteData },
		{ type: "tRNS", data: trnsData },
		{ type: "IDAT", data: idatData },
		{ type: "IEND", data: Buffer.alloc(0) },
	]);
}

// Inserts a raw APPn segment right after JPEG's SOI marker (FFD8).
function insertJpegAppSegmentAfterSoi(
	buf: Buffer,
	marker: number,
	data: Buffer,
): Buffer {
	const lengthBuf = Buffer.alloc(2);
	lengthBuf.writeUInt16BE(data.length + 2, 0);
	const segment = Buffer.concat([
		Buffer.from([0xff, marker]),
		lengthBuf,
		data,
	]);
	return Buffer.concat([buf.subarray(0, 2), segment, buf.subarray(2)]);
}

function buildAdobeApp14Segment(): Buffer {
	// "Adobe" (5 ascii) + DCTEncodeVersion(2BE) + APP14Flags0(2BE) + APP14Flags1(2BE) +
	// ColorTransform(1). Measured: exiftool -APP14:*= is not writable (no writable APP14
	// tag group), so this segment is unreachable via any seed-args call.
	return Buffer.concat([
		Buffer.from("Adobe", "ascii"),
		Buffer.from([0x00, 0x64]), // version 100
		Buffer.from([0x00, 0x00]), // flags0
		Buffer.from([0x00, 0x00]), // flags1
		Buffer.from([0x00]), // colorTransform = unknown
	]);
}

// -----------------------------------------------------------------------------------------
// ExifTool CLI seeding helper (variant construction only -- the sweep's own measured engines
// are ExifToolAdapter/NativeMetadataAdapter below, not this raw CLI call).
// -----------------------------------------------------------------------------------------

const IDENTIFYING_SEED_ARGS = [
	"-Artist=ZZ58-ARTIST",
	"-Copyright=ZZ58-COPYRIGHT",
	"-Make=ZZ58-MAKE",
	"-Model=ZZ58-MODEL",
	"-GPSLatitude=37.7749",
	"-GPSLatitudeRef=N",
	"-XMP-dc:Creator=ZZ58-CREATOR",
] as const;

function seedWithExiftool(filePath: string, args: readonly string[]): void {
	execFileSync(EXIFTOOL_PATH, ["-overwrite_original", ...args, filePath], {
		stdio: ["ignore", "ignore", "pipe"],
	});
}

// -----------------------------------------------------------------------------------------
// Variant construction
// -----------------------------------------------------------------------------------------

interface Variant {
	readonly name: string;
	readonly format: "jpeg" | "png";
	readonly build: (dir: string) => string; // returns the built file path
}

function copyFixture(dir: string, fixtureName: string, destName: string): string {
	const dest = path.join(dir, destName);
	fs.copyFileSync(path.join(FIXTURES_DIR, fixtureName), dest);
	return dest;
}

const JPEG_BOTH_300_ARGS = [
	"-JFIF:XResolution=300",
	"-JFIF:YResolution=300",
	"-JFIF:ResolutionUnit=inches",
	"-IFD0:XResolution=300",
	"-IFD0:YResolution=300",
	"-IFD0:ResolutionUnit=inches",
] as const;

const PNG_PHYS_SEED_ARGS = [
	"-PNG:PixelsPerUnitX=11811",
	"-PNG:PixelsPerUnitY=11811",
	"-PNG:PixelUnits=meters",
] as const;

const ICC_FIXTURE = path.join(FIXTURES_DIR, "webp-oracle-profile.icc");

const VARIANTS: readonly Variant[] = [
	{
		name: "jpeg-sample",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.jpg", "jpeg-sample.jpg");
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			return dest;
		},
	},
	{
		name: "jpeg-orientation",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "orientation.jpg", "jpeg-orientation.jpg");
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			return dest;
		},
	},
	{
		name: "jpeg-no-metadata",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "no_metadata.jpg", "jpeg-no-metadata.jpg");
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			return dest;
		},
	},
	{
		name: "jpeg-resolution",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.jpg", "jpeg-resolution.jpg");
			seedWithExiftool(dest, [...IDENTIFYING_SEED_ARGS, ...JPEG_BOTH_300_ARGS]);
			return dest;
		},
	},
	{
		name: "jpeg-icc",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.jpg", "jpeg-icc.jpg");
			seedWithExiftool(dest, [
				...IDENTIFYING_SEED_ARGS,
				`-icc_profile<=${ICC_FIXTURE}`,
			]);
			return dest;
		},
	},
	{
		name: "jpeg-app14-adobe",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.jpg", "jpeg-app14-adobe.jpg");
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			const original = fs.readFileSync(dest);
			const withApp14 = insertJpegAppSegmentAfterSoi(
				original,
				0xee,
				buildAdobeApp14Segment(),
			);
			fs.writeFileSync(dest, withApp14);
			return dest;
		},
	},
	{
		name: "jpeg-xmp-com-thumbnail",
		format: "jpeg",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.jpg", "jpeg-xmp-com-thumbnail.jpg");
			const thumbSource = copyFixture(dir, "sample.jpg", "thumb-src.jpg");
			seedWithExiftool(dest, [
				...IDENTIFYING_SEED_ARGS,
				"-Comment=ZZ58-COMMENT",
				`-ThumbnailImage<=${thumbSource}`,
			]);
			return dest;
		},
	},
	{
		name: "png-sample",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.png", "png-sample.png");
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			return dest;
		},
	},
	{
		name: "png-orientation-exif",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.png", "png-orientation-exif.png");
			seedWithExiftool(dest, [...IDENTIFYING_SEED_ARGS, "-Orientation#=6"]);
			return dest;
		},
	},
	{
		name: "png-resolution",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.png", "png-resolution.png");
			seedWithExiftool(dest, [...IDENTIFYING_SEED_ARGS, ...PNG_PHYS_SEED_ARGS]);
			return dest;
		},
	},
	{
		name: "png-icc",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(dir, "sample.png", "png-icc.png");
			seedWithExiftool(dest, [
				...IDENTIFYING_SEED_ARGS,
				`-icc_profile<=${ICC_FIXTURE}`,
			]);
			return dest;
		},
	},
	{
		name: "png-gamma-chrm-srgb-bkgd-sbit-time-trns",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(
				dir,
				"sample.png",
				"png-gamma-chrm-srgb-bkgd-sbit-time-trns.png",
			);
			seedWithExiftool(dest, [
				...IDENTIFYING_SEED_ARGS,
				"-Gamma=0.45455",
				"-ModifyDate=2020:01:01 00:00:00",
			]);
			const original = fs.readFileSync(dest);
			const { beforePlte, beforeIdat } =
				buildGammaChromaSrgbSignificantChunks();
			const withChunks = insertPngAncillaryChunks(
				original,
				beforePlte,
				beforeIdat,
			);
			fs.writeFileSync(dest, withChunks);
			return dest;
		},
	},
	{
		name: "png-palette",
		format: "png",
		build: (dir) => {
			const dest = path.join(dir, "png-palette.png");
			fs.writeFileSync(dest, buildSyntheticPalettePng());
			seedWithExiftool(dest, IDENTIFYING_SEED_ARGS);
			return dest;
		},
	},
	{
		name: "png-xmp-only-orientation",
		format: "png",
		build: (dir) => {
			const dest = copyFixture(
				dir,
				"sample.png",
				"png-xmp-only-orientation.png",
			);
			seedWithExiftool(dest, [
				...IDENTIFYING_SEED_ARGS,
				"-XMP-tiff:Orientation#=6",
			]);
			return dest;
		},
	},
];

// -----------------------------------------------------------------------------------------
// Preservation combinations (8) -- preserveTimestamps is always false per the plan.
// -----------------------------------------------------------------------------------------

interface Combo {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
}

const COMBOS: readonly Combo[] = (() => {
	const combos: Combo[] = [];
	for (const preserveOrientation of [false, true]) {
		for (const preserveColorProfile of [false, true]) {
			for (const preserveResolution of [false, true]) {
				combos.push({
					preserveOrientation,
					preserveColorProfile,
					preserveResolution,
				});
			}
		}
	}
	return combos;
})();

function comboLabel(combo: Combo): string {
	const flags: string[] = [];
	if (combo.preserveOrientation) flags.push("orientation");
	if (combo.preserveColorProfile) flags.push("colorProfile");
	if (combo.preserveResolution) flags.push("resolution");
	return flags.length === 0 ? "none" : flags.join("+");
}

// -----------------------------------------------------------------------------------------
// Row shape
// -----------------------------------------------------------------------------------------

interface SweepRow {
	readonly variant: string;
	readonly format: "jpeg" | "png";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly engine: "exiftool" | "native";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
	readonly decline?: {
		readonly nativeCode: string;
		readonly phase: string;
		readonly feature: string | undefined;
		readonly nativeWrite: string;
	};
	readonly error?: string;
}

async function readOutputKeys(filePath: string): Promise<string[]> {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath]).toString();
	const parsed = JSON.parse(raw) as Record<string, unknown>[];
	const record = parsed[0];
	if (record === undefined) {
		throw new Error(`No record read back from ${filePath}`);
	}
	return Object.keys(record);
}

// -----------------------------------------------------------------------------------------
// Removal confirmation -- every seeded identifying tag must be absent from every output.
// -----------------------------------------------------------------------------------------

const IDENTIFYING_MARKERS = [
	"ZZ58-ARTIST",
	"ZZ58-COPYRIGHT",
	"ZZ58-MAKE",
	"ZZ58-MODEL",
	"37.7749",
	"37 deg",
	"ZZ58-CREATOR",
	"ZZ58-COMMENT",
] as const;

async function assertNoIdentifyingLeak(filePath: string): Promise<string[]> {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath]).toString();
	const parsed = JSON.parse(raw) as Record<string, unknown>[];
	const record = parsed[0] ?? {};
	const hits: string[] = [];
	for (const [key, value] of Object.entries(record)) {
		const stringValue = typeof value === "string" ? value : JSON.stringify(value);
		for (const marker of IDENTIFYING_MARKERS) {
			if (stringValue.includes(marker)) {
				hits.push(`${key}=${stringValue} (marker ${marker})`);
			}
		}
	}
	return hits;
}

// -----------------------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------------------

async function main(): Promise<void> {
	const outputPath = parseOutputArg();
	const scratchRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "gsd58-copy-mode-leak-sweep-"),
	);
	const variantsDir = path.join(scratchRoot, "variants");
	const outputsDir = path.join(scratchRoot, "outputs");
	fs.mkdirSync(variantsDir);
	fs.mkdirSync(outputsDir);

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	await exiftoolProcess.open();
	const exiftoolAdapter = new ExifToolAdapter({ process: exiftoolProcess });
	const nativeAdapter = new NativeMetadataAdapter();

	const rows: SweepRow[] = [];
	const removalConfirmationFailures: string[] = [];
	let outputSeq = 0;

	try {
		for (const variant of VARIANTS) {
			const sourcePath = variant.build(variantsDir);

			for (const combo of COMBOS) {
				const label = comboLabel(combo);

				for (const engine of ["exiftool", "native"] as const) {
					outputSeq += 1;
					const destinationPath = path.join(
						outputsDir,
						`${outputSeq}-${variant.name}-${label}-${engine}${
							variant.format === "jpeg" ? ".jpg" : ".png"
						}`,
					);

					if (engine === "exiftool") {
						const result = await exiftoolAdapter.sanitize({
							source: sourcePath,
							destination: destinationPath,
							outputMode: "copy",
							preserveOrientation: combo.preserveOrientation,
							preserveColorProfile: combo.preserveColorProfile,
							preserveResolution: combo.preserveResolution,
							preserveTimestamps: false,
						});
						if (!result.ok) {
							rows.push({
								variant: variant.name,
								format: variant.format,
								combo: label,
								preserveOrientation: combo.preserveOrientation,
								preserveColorProfile: combo.preserveColorProfile,
								preserveResolution: combo.preserveResolution,
								engine,
								outcome: "error",
								keys: [],
								error: JSON.stringify(result.error),
							});
							console.error(
								`EXIFTOOL_SANITIZE_ERROR variant=${variant.name} combo=${label} error=${JSON.stringify(result.error)}`,
							);
							continue;
						}
						const keys = await readOutputKeys(destinationPath);
						const leaks = await assertNoIdentifyingLeak(destinationPath);
						if (leaks.length > 0) {
							removalConfirmationFailures.push(
								`exiftool ${variant.name} ${label}: ${leaks.join("; ")}`,
							);
						}
						rows.push({
							variant: variant.name,
							format: variant.format,
							combo: label,
							preserveOrientation: combo.preserveOrientation,
							preserveColorProfile: combo.preserveColorProfile,
							preserveResolution: combo.preserveResolution,
							engine,
							outcome: "written",
							keys,
						});
					} else {
						const result = await nativeAdapter.sanitize({
							source: sourcePath,
							destination: destinationPath,
							outputMode: "copy",
							preserveOrientation: combo.preserveOrientation,
							preserveColorProfile: combo.preserveColorProfile,
							preserveResolution: combo.preserveResolution,
							preserveTimestamps: false,
						});
						if (!result.ok) {
							rows.push({
								variant: variant.name,
								format: variant.format,
								combo: label,
								preserveOrientation: combo.preserveOrientation,
								preserveColorProfile: combo.preserveColorProfile,
								preserveResolution: combo.preserveResolution,
								engine,
								outcome: "declined",
								keys: [],
								decline: {
									nativeCode: result.error.nativeCode,
									phase: result.error.phase,
									feature: result.error.feature,
									nativeWrite: result.error.nativeWrite,
								},
							});
							continue;
						}
						const keys = await readOutputKeys(destinationPath);
						const leaks = await assertNoIdentifyingLeak(destinationPath);
						if (leaks.length > 0) {
							removalConfirmationFailures.push(
								`native ${variant.name} ${label}: ${leaks.join("; ")}`,
							);
						}
						rows.push({
							variant: variant.name,
							format: variant.format,
							combo: label,
							preserveOrientation: combo.preserveOrientation,
							preserveColorProfile: combo.preserveColorProfile,
							preserveResolution: combo.preserveResolution,
							engine,
							outcome: "written",
							keys,
						});
					}
				}
			}
		}
	} finally {
		await exiftoolProcess.close();
	}

	fs.writeFileSync(outputPath, JSON.stringify(rows, null, "\t"));

	const formats = new Set(rows.map((r) => r.format));
	const engines = new Set(rows.map((r) => r.engine));
	console.log(`SWEEP_ROWS=${rows.length}`);
	console.log(`SWEEP_FORMATS=${[...formats].join(",")}`);
	console.log(`SWEEP_ENGINES=${[...engines].join(",")}`);
	console.log(
		`SWEEP_OUTCOMES=written:${rows.filter((r) => r.outcome === "written").length},declined:${rows.filter((r) => r.outcome === "declined").length},error:${rows.filter((r) => r.outcome === "error").length}`,
	);

	if (removalConfirmationFailures.length > 0) {
		console.error("REMOVAL_CONFIRMATION_FAILURES:");
		for (const failure of removalConfirmationFailures) {
			console.error(`  ${failure}`);
		}
		process.exitCode = 1;
	} else {
		console.log("REMOVAL_CONFIRMATION=all identifying markers absent from every output");
	}

	fs.rmSync(scratchRoot, { recursive: true, force: true });
	console.log("SWEEP_COMPLETE");
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
