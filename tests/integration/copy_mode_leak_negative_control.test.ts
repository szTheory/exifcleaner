// Phase 58-05 (D-12): three-layer negative control proving SC2's "verification turns red on an
// injected leaked tag" is non-vacuous -- at the pure-verdict layer (VerifyGeneratedOutputQuery
// with copyModeLeakCheck) AND through the real OutputTransaction, with whole-directory
// blast-radius assertions. Mirrors tiff_private_tag_negative_control.test.ts's model: real
// ExiftoolProcess + ExifToolAdapter + NativeMetadataAdapter + HybridMetadataEngine, no fakes of
// the engines themselves. Per D-28/Phase 50 D-18b, this is a negative control in substance but
// deliberately not registered in the numbered NC ledger.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const SENTINEL = "ZZLEAK-58";

const DEFAULT_PRESERVATION = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	preserveTimestamps: false,
};

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function injectJpegSentinel(filePath: string): void {
	execFileSync(EXIFTOOL_PATH, [
		"-overwrite_original",
		`-XMP-dc:Creator=${SENTINEL}`,
		"-GPSLatitude=37.7749",
		"-GPSLatitudeRef=N",
		filePath,
	]);
}

function injectPngSentinel(filePath: string): void {
	execFileSync(EXIFTOOL_PATH, [
		"-overwrite_original",
		`-PNG:Comment=${SENTINEL}`,
		filePath,
	]);
}

type Case = {
	readonly name: "jpeg" | "png";
	readonly fixture: string;
	readonly inject: (filePath: string) => void;
	readonly leakedTagPrefix: string;
};

const CASES: readonly Case[] = [
	{
		name: "jpeg",
		fixture: "sample.jpg",
		inject: injectJpegSentinel,
		leakedTagPrefix: "XMP-dc:Creator",
	},
	{
		name: "png",
		fixture: "sample.png",
		inject: injectPngSentinel,
		leakedTagPrefix: "PNG:Comment",
	},
];

describe("58-05: copy-mode leak check is red on an injected leak (D-12)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeTempDir(prefix: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		temporaryDirs.push(dir);
		return dir;
	}

	for (const testCase of CASES) {
		describe(testCase.name, () => {
			it(`layer 1: a clean native ${testCase.name} copy passes copyModeLeakCheck`, async () => {
				const dir = makeTempDir(`copy-leak-l1-${testCase.name}-`);
				const source = path.join(dir, testCase.fixture);
				const destination = path.join(dir, `cleaned-${testCase.fixture}`);
				fs.copyFileSync(path.join(FIXTURES, testCase.fixture), source);

				const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
				const exiftool = new ExifToolAdapter({ process });
				const native = new NativeMetadataAdapter();
				const hybrid = new HybridMetadataEngine({ exiftool, native });
				const verify = new VerifyGeneratedOutputQuery({
					metadataEngine: hybrid,
				});
				const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
				const nativeWrite = vi.spyOn(native, "sanitize");

				await process.open();
				try {
					const writeResult = await hybrid.sanitize({
						source,
						destination,
						outputMode: "copy",
						...DEFAULT_PRESERVATION,
					});
					expect(writeResult).toEqual({ ok: true, value: undefined });
					expect(nativeWrite).toHaveBeenCalledOnce();
					expect(exiftoolWrite).not.toHaveBeenCalled();

					const verifyResult = await verify.execute({
						generatedPath: destination,
						copyModeLeakCheck: {
							preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
							preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
							preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						},
					});
					expect(verifyResult).toEqual({ ok: true, value: undefined });
				} finally {
					await process.close();
				}
			});

			it(`layer 2: a ${testCase.name} sentinel injected by raw ExifTool turns copyModeLeakCheck red`, async () => {
				const dir = makeTempDir(`copy-leak-l2-${testCase.name}-`);
				const source = path.join(dir, testCase.fixture);
				const destination = path.join(dir, `cleaned-${testCase.fixture}`);
				fs.copyFileSync(path.join(FIXTURES, testCase.fixture), source);

				const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
				const exiftool = new ExifToolAdapter({ process });
				const native = new NativeMetadataAdapter();
				const hybrid = new HybridMetadataEngine({ exiftool, native });
				const verify = new VerifyGeneratedOutputQuery({
					metadataEngine: hybrid,
				});

				await process.open();
				try {
					const writeResult = await hybrid.sanitize({
						source,
						destination,
						outputMode: "copy",
						...DEFAULT_PRESERVATION,
					});
					expect(writeResult).toEqual({ ok: true, value: undefined });

					// Sanity: clean output passes before injection.
					const clean = await verify.execute({
						generatedPath: destination,
						copyModeLeakCheck: {
							preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
							preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
							preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						},
					});
					expect(clean).toEqual({ ok: true, value: undefined });

					testCase.inject(destination);

					const leaked = await verify.execute({
						generatedPath: destination,
						copyModeLeakCheck: {
							preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
							preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
							preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						},
					});
					expect(leaked).toMatchObject({
						ok: false,
						error: { code: "output-metadata-leak" },
					});
					if (leaked.ok) return;
					if (leaked.error.code !== "output-metadata-leak") return;
					expect(leaked.error.leakedTags).toContain(testCase.leakedTagPrefix);
					expect(leaked.error.detail).not.toContain(SENTINEL);
					expect(JSON.stringify(leaked)).not.toContain(SENTINEL);
				} finally {
					await process.close();
				}
			});

			it(`layer 3: a leaking ${testCase.name} staged output is removed by the real OutputTransaction, source preserved, directory exact (D-12)`, async () => {
				const dir = makeTempDir(`copy-leak-l3-${testCase.name}-`);
				const source = path.join(dir, testCase.fixture);
				fs.copyFileSync(path.join(FIXTURES, testCase.fixture), source);
				const sourceDigestBefore = sha256(source);
				const generatedPath = path.join(
					dir,
					`.${testCase.fixture}.exifcleaner-stage${path.extname(testCase.fixture)}`,
				);

				const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
				const exiftool = new ExifToolAdapter({ process });
				const native = new NativeMetadataAdapter();
				const hybrid = new HybridMetadataEngine({ exiftool, native });
				const realStripMetadata = new StripMetadataCommand({
					metadataEngine: hybrid,
				});
				const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
					metadataEngine: hybrid,
				});

				const injectingStripMetadata = {
					execute: async (
						request: Parameters<StripMetadataCommand["execute"]>[0],
					) => {
						const result = await realStripMetadata.execute(request);
						if (result.ok) {
							testCase.inject(request.outputPath as string);
						}
						return result;
					},
				};

				const transaction = new OutputTransaction({
					stripMetadata: injectingStripMetadata,
					verifyGeneratedOutput,
					unlink: fs.promises.unlink,
					rename: fs.promises.rename,
					delay: async (milliseconds) => {
						await new Promise<void>((resolve) =>
							setTimeout(resolve, milliseconds),
						);
					},
				});

				await process.open();
				try {
					const before = snapshotDir(dir);
					const result = await transaction.execute({
						filePath: source,
						generatedPath,
						preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
						preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
						preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						preserveTimestamps: DEFAULT_PRESERVATION.preserveTimestamps,
						copyModeLeakCheck: {
							preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
							preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
							preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						},
					});
					const after = snapshotDir(dir);

					expect(result).toEqual({
						ok: false,
						error: {
							code: "verification-failed",
							verificationCode: "output-metadata-leak",
						},
					});
					expect(fs.existsSync(generatedPath)).toBe(false);
					expect(sha256(source)).toBe(sourceDigestBefore);
					assertDirEffect(before, after, {
						unchanged: [testCase.fixture],
						added: [],
						modified: [],
						removed: [],
					});
				} finally {
					await process.close();
				}
			});

			it(`layer 3 positive twin: a clean ${testCase.name} staged output publishes through the real OutputTransaction`, async () => {
				const dir = makeTempDir(`copy-leak-l3-clean-${testCase.name}-`);
				const source = path.join(dir, testCase.fixture);
				fs.copyFileSync(path.join(FIXTURES, testCase.fixture), source);
				const sourceDigestBefore = sha256(source);
				const generatedPath = path.join(
					dir,
					`.${testCase.fixture}.exifcleaner-stage${path.extname(testCase.fixture)}`,
				);

				const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
				const exiftool = new ExifToolAdapter({ process });
				const native = new NativeMetadataAdapter();
				const hybrid = new HybridMetadataEngine({ exiftool, native });
				const stripMetadata = new StripMetadataCommand({
					metadataEngine: hybrid,
				});
				const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
					metadataEngine: hybrid,
				});

				const transaction = new OutputTransaction({
					stripMetadata,
					verifyGeneratedOutput,
					unlink: fs.promises.unlink,
					rename: fs.promises.rename,
					delay: async (milliseconds) => {
						await new Promise<void>((resolve) =>
							setTimeout(resolve, milliseconds),
						);
					},
				});

				await process.open();
				try {
					const before = snapshotDir(dir);
					const result = await transaction.execute({
						filePath: source,
						generatedPath,
						preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
						preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
						preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						preserveTimestamps: DEFAULT_PRESERVATION.preserveTimestamps,
						copyModeLeakCheck: {
							preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
							preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
							preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						},
					});
					const after = snapshotDir(dir);

					expect(result).toEqual({
						ok: true,
						value: { outputPath: generatedPath },
					});
					expect(fs.existsSync(generatedPath)).toBe(true);
					expect(sha256(source)).toBe(sourceDigestBefore);
					assertDirEffect(before, after, {
						unchanged: [testCase.fixture],
						added: [path.basename(generatedPath)],
						modified: [],
						removed: [],
					});
				} finally {
					await process.close();
				}
			});
		});
	}

	it("fallback row: an XMP-only-orientation PNG declined natively still passes copyModeLeakCheck through the ExifTool fallback (D-11)", async () => {
		const dir = makeTempDir("copy-leak-fallback-png-");
		const source = path.join(dir, "orientation-xmp-only.png");
		const destination = path.join(dir, "orientation-xmp-only-cleaned.png");
		fs.copyFileSync(path.join(FIXTURES, "sample.png"), source);
		execFileSync(EXIFTOOL_PATH, [
			"-overwrite_original",
			"-XMP-tiff:Orientation#=6",
			source,
		]);

		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const verify = new VerifyGeneratedOutputQuery({ metadataEngine: hybrid });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const writeResult = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(writeResult).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).toHaveBeenCalledOnce();

			const verifyResult = await verify.execute({
				generatedPath: destination,
				copyModeLeakCheck: {
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				},
			});
			expect(verifyResult).toEqual({ ok: true, value: undefined });
		} finally {
			await process.close();
		}
	});
});
