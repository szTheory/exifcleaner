// Regression: with Preserve color profile on (the default), Save as Copy rejected JPEGs whose
// embedded ICC profile carries the 'chad' (ChromaticAdaptation) and 'bkpt' (MediaBlackPoint)
// tags -- for example a Pixel's "sRGB IEC61966-2.1" profile -- with "Couldn't verify cleaned
// output". The kept profile is exactly what the user asked to preserve; those two tags are
// colorimetry, not identifying metadata. Real stack end to end.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import type { MetadataEnginePort } from "../../src/application/metadata_engine_port";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { copyModeLeakCheckDemandOf } from "../../src/domain/files/file_types";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { writeColorJpeg } from "../helpers/color_jpeg";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { buildTestIccProfile } from "../helpers/icc_profile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function readTags(filePath: string, tags: readonly string[]): string[] {
	return execFileSync(EXIFTOOL_PATH, ["-s3", ...tags, filePath])
		.toString()
		.split(/\r?\n/u)
		.filter(Boolean);
}

describe("JPEG with a chad/bkpt ICC profile through Save as Copy", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const engines: Record<"hybrid" | "exiftool", MetadataEnginePort> = {
		hybrid: new HybridMetadataEngine({
			exiftool,
			native: new NativeMetadataAdapter(),
		}),
		exiftool,
	};
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icc-jpeg-copy-"));
	const iccPath = path.join(dir, "test.icc");

	beforeAll(async () => {
		fs.writeFileSync(iccPath, buildTestIccProfile());
		await exiftoolProcess.open();
	});

	afterAll(async () => {
		await exiftoolProcess.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function seededSource(caseDir: string): string {
		const source = writeColorJpeg({ dir: caseDir, name: "photo.jpg" });
		execFileSync(EXIFTOOL_PATH, [
			"-q",
			"-overwrite_original",
			`-ICC_Profile<=${iccPath}`,
			"-GPSLatitude=51.5",
			"-GPSLatitudeRef=N",
			"-Artist=ZZ-ICC-JPEG",
			source,
		]);
		return source;
	}

	it("the seeded source carries both ICC tags", () => {
		const caseDir = path.join(dir, "precondition");
		fs.mkdirSync(caseDir);
		expect(
			readTags(seededSource(caseDir), [
				"-ICC_Profile:MediaBlackPoint",
				"-ICC_Profile:ChromaticAdaptation",
			]),
		).toHaveLength(2);
	});

	for (const engineName of ["hybrid", "exiftool"] as const) {
		it(`${engineName}: keeps the profile, drops GPS and Artist, and verifies the copy`, async () => {
			const caseDir = path.join(dir, engineName);
			fs.mkdirSync(caseDir);
			const source = seededSource(caseDir);
			const generatedPath = path.join(caseDir, "photo_cleaned.jpg");
			const before = snapshotDir(caseDir);
			const metadataEngine = engines[engineName];
			const preservation = {
				preserveOrientation: false,
				preserveColorProfile: true,
				preserveResolution: false,
			};
			const transaction = new OutputTransaction({
				stripMetadata: new StripMetadataCommand({ metadataEngine }),
				verifyGeneratedOutput: new VerifyGeneratedOutputQuery({
					metadataEngine,
				}),
				unlink: fs.promises.unlink,
				rename: fs.promises.rename,
				delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			});

			const result = await transaction.execute({
				filePath: source,
				generatedPath,
				...preservation,
				preserveTimestamps: false,
				copyModeLeakCheck: {
					demand: copyModeLeakCheckDemandOf({
						filename: source,
						outputMode: "copy",
					})!,
					...preservation,
				},
			});

			expect(result).toEqual({
				ok: true,
				value: { outputPath: generatedPath },
			});
			assertDirEffect(before, snapshotDir(caseDir), {
				unchanged: ["photo.jpg"],
				added: ["photo_cleaned.jpg"],
				modified: [],
				removed: [],
			});
			expect(readTags(generatedPath, ["-GPSLatitude", "-Artist"])).toEqual([]);
			expect(
				readTags(generatedPath, ["-ICC_Profile:ProfileDescription"]),
			).toEqual(["ExifCleaner test sRGB"]);
		});
	}
});
