// Phase 63-02 tracer: one default-settings .heic Save as copy through the REAL stack (real
// ExiftoolProcess + ExifToolAdapter + NativeMetadataAdapter/exifcleaner-node 0.4.0 +
// HybridMetadataEngine + StripMetadataCommand + VerifyGeneratedOutputQuery + OutputTransaction).
// Proves router provenance (D-01), the reopen + HEIC leak check (D-07/D-08) and publication with
// the source untouched, on a seeded identifying file.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { copyModeLeakCheckDemandOf } from "../../src/domain/files/file_types";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../e2e/fixtures/sample-sips.heic");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

// D-12: sips-generated from sample.png; the sha prefix is the authority for the fixture bytes.
const FIXTURE_SHA256_PREFIX = "588fb842";

const SEED_ARGS = [
	"-Artist=ZZ63-ARTIST",
	"-Copyright=ZZ63-COPYRIGHT",
	"-Make=ZZ63-MAKE",
	"-Model=ZZ63-MODEL",
	"-GPSLatitude=37.7749",
	"-GPSLatitudeRef=N",
	"-XMP-dc:Creator=ZZ63-CREATOR",
	"-Orientation#=6",
	"-IFD0:XResolution=300",
	"-IFD0:YResolution=300",
	"-IFD0:ResolutionUnit=inches",
];

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("63-02 tracer: default-settings .heic copy goes native, reopens, leak-checks, publishes", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes natively once, reports writtenBy native to verify, and publishes only the cleaned copy", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-tracer-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "photo.heic");
		fs.copyFileSync(FIXTURE, source);
		expect(sha256(source).startsWith(FIXTURE_SHA256_PREFIX)).toBe(true);
		execFileSync(EXIFTOOL_PATH, ["-overwrite_original", ...SEED_ARGS, source], {
			stdio: ["ignore", "ignore", "pipe"],
		});
		const sourceDigestBefore = sha256(source);

		const generatedPath = generateCleanedPath({
			filePath: source,
			exists: fs.existsSync,
		});
		expect(path.basename(generatedPath)).toBe("photo_cleaned.heic");

		const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const stripMetadata = new StripMetadataCommand({ metadataEngine: hybrid });
		const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		const verifySpy = vi.spyOn(verifyGeneratedOutput, "execute");
		const transaction = new OutputTransaction({
			stripMetadata,
			verifyGeneratedOutput,
			unlink: fs.promises.unlink,
			rename: fs.promises.rename,
			delay: async (milliseconds) => {
				await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
			},
		});

		// Built exactly as exif_handlers does: only when the gating predicate says so.
		const leakCheckDemand = copyModeLeakCheckDemandOf({
			filename: source,
			outputMode: "copy",
		});
		const copyModeLeakCheck =
			leakCheckDemand !== undefined
				? {
						demand: leakCheckDemand,
						preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
						preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
						preserveResolution: DEFAULT_SETTINGS.preserveResolution,
					}
				: undefined;
		expect(copyModeLeakCheck).toBeDefined();

		await exiftoolProcess.open();
		try {
			const before = snapshotDir(dir);
			const result = await transaction.execute({
				filePath: source,
				generatedPath,
				preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
				preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
				preserveResolution: DEFAULT_SETTINGS.preserveResolution,
				preserveTimestamps: DEFAULT_SETTINGS.preserveTimestamps,
				...(copyModeLeakCheck === undefined ? {} : { copyModeLeakCheck }),
			});
			const after = snapshotDir(dir);

			expect(result).toEqual({
				ok: true,
				value: { outputPath: generatedPath },
			});
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).not.toHaveBeenCalled();

			expect(verifySpy).toHaveBeenCalledOnce();
			const verifyArgument = verifySpy.mock.calls[0]?.[0];
			expect(verifyArgument?.copyModeLeakCheck?.writtenBy).toBe("native");
			await expect(verifySpy.mock.results[0]?.value).resolves.toEqual({
				ok: true,
				value: { exemptionsApplied: [] },
			});

			// Independent reopen of the published file.
			const raw = execFileSync(
				EXIFTOOL_PATH,
				["-j", "-G1:2:4", generatedPath],
				{ maxBuffer: 64 * 1024 * 1024 },
			).toString();
			const record = (JSON.parse(raw) as Record<string, unknown>[])[0];
			expect(record).toBeDefined();
			const keys = Object.keys(record ?? {});
			expect(record?.["File:Other:FileType"] ?? record?.["File:FileType"]).toBe(
				"HEIC",
			);
			expect(raw).not.toContain("ZZ63-");
			for (const forbidden of [
				"GPS",
				"Artist",
				"Make",
				"Model",
				"XMP-dc:Author:Creator",
				"Creator",
			]) {
				expect(keys.some((key) => key.includes(forbidden))).toBe(false);
			}
			expect(keys.some((key) => key.endsWith("Orientation"))).toBe(true);

			expect(sha256(source)).toBe(sourceDigestBefore);
			assertDirEffect(before, after, {
				unchanged: ["photo.heic"],
				added: ["photo_cleaned.heic"],
				modified: [],
				removed: [],
			});
		} finally {
			await exiftoolProcess.close();
		}
	});
});
