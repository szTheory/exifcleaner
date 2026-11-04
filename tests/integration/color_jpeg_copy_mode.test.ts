// Regression: Save as Copy rejected every ordinary color JPEG with "Couldn't verify cleaned
// output". ExifTool reports File:YCbCrSubSampling for any three-component JPEG -- it is read
// from the SOF frame header, describes the pixel encoding, and cannot be removed without
// re-encoding -- but the JPEG copy-mode allowlist did not include it, so the leak check
// flagged it and the transaction deleted the cleaned copy. Real stack end to end.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import type { MetadataEnginePort } from "../../src/application/metadata_engine_port";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { DEFAULT_SETTINGS } from "../../src/domain";
import { copyModeLeakCheckDemandOf } from "../../src/domain/files/file_types";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { writeColorJpeg } from "../helpers/color_jpeg";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const PRESERVATION_COMBOS = [
	{
		preserveOrientation: false,
		preserveColorProfile: false,
		preserveResolution: false,
	},
	{
		preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
		preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
		preserveResolution: DEFAULT_SETTINGS.preserveResolution,
	},
	{
		preserveOrientation: true,
		preserveColorProfile: true,
		preserveResolution: true,
	},
].filter(
	(combo, index, all) =>
		all.findIndex(
			(other) => JSON.stringify(other) === JSON.stringify(combo),
		) === index,
);

describe("color JPEG through Save as Copy", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const engines: Record<"hybrid" | "exiftool", MetadataEnginePort> = {
		hybrid: new HybridMetadataEngine({
			exiftool,
			native: new NativeMetadataAdapter(),
		}),
		exiftool,
	};
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "color-jpeg-copy-"));

	beforeAll(async () => {
		await exiftoolProcess.open();
	});

	afterAll(async () => {
		await exiftoolProcess.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function seededColorJpeg(caseDir: string): string {
		const source = writeColorJpeg({ dir: caseDir, name: "photo.jpg" });
		execFileSync(EXIFTOOL_PATH, [
			"-q",
			"-overwrite_original",
			"-GPSLatitude=51.5",
			"-GPSLatitudeRef=N",
			"-Artist=ZZ-COLOR-JPEG",
			"-Orientation#=6",
			source,
		]);
		return source;
	}

	it("the fixture is a three-component JPEG that ExifTool reports YCbCrSubSampling for", () => {
		const source = writeColorJpeg({ dir, name: "precondition.jpg" });
		const output = execFileSync(EXIFTOOL_PATH, [
			"-s3",
			"-File:ColorComponents",
			"-File:YCbCrSubSampling",
			source,
		]).toString();
		expect(output.split(/\r?\n/u).filter(Boolean)).toEqual([
			"3",
			"YCbCr4:2:0 (2 2)",
		]);
	});

	for (const engineName of ["hybrid", "exiftool"] as const) {
		it.each(PRESERVATION_COMBOS)(
			`${engineName}: writes and verifies the cleaned copy (orientation=$preserveOrientation, colorProfile=$preserveColorProfile, resolution=$preserveResolution)`,
			async (preservation) => {
				const tag = `${engineName}-${preservation.preserveOrientation}-${preservation.preserveColorProfile}-${preservation.preserveResolution}`;
				const caseDir = path.join(dir, tag);
				fs.mkdirSync(caseDir);
				const source = seededColorJpeg(caseDir);
				const generatedPath = path.join(caseDir, "photo_cleaned.jpg");
				const before = snapshotDir(caseDir);
				const metadataEngine = engines[engineName];
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
				// The original is untouched, and the verified copy is the only new file (no
				// staging or _exiftool_tmp leftovers).
				assertDirEffect(before, snapshotDir(caseDir), {
					unchanged: ["photo.jpg"],
					added: ["photo_cleaned.jpg"],
					modified: [],
					removed: [],
				});
				const after = execFileSync(EXIFTOOL_PATH, [
					"-s3",
					"-GPSLatitude",
					"-Artist",
					generatedPath,
				]).toString();
				expect(after.trim()).toBe("");
			},
		);
	}
});
