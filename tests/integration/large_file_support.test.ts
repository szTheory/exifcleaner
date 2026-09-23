// D-50 regression lock for ExifTool's `LargeFileSupport` default (on since ExifTool 12.88,
// 2024-07-11 -- see RESEARCH.md Finding 1 for the corrected version/date). Deliberately
// carries no NC- number and is not registered in the NC ledger
// (tests/contracts/negative_control_evidence.test.ts), per the Phase 51 D-28 precedent for
// dual-half real-ExifTool proofs that are negative controls in substance but not in the
// numbered ledger. The ~4 GiB output write below is an accepted, bounded cost that criterion
// 3 does not cover -- only the sparse *input* fixture is free.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { OutputTransaction } from "../../src/main/output_transaction";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	FOUR_GIB,
	assertLargeFileHost,
	createSparseLargeMp4,
	sha256OfFileStreamed,
} from "../helpers/large_file_fixture";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");
const SAMPLE_MP4 = path.resolve(__dirname, "../e2e/fixtures/sample.mp4");

// Not run on Windows: the fixture relies on POSIX sparse ftruncate and st_blocks, and CI runs
// vitest only on ubuntu-24.04.
const WINDOWS_EXCLUSION_REASON =
	"not run on Windows: the fixture relies on POSIX sparse ftruncate and st_blocks, and CI runs vitest only on ubuntu-24.04";

describe.skipIf(process.platform === "win32")(
	`Large-file (>4 GiB) support on ExifTool's default (LRG-01, LRG-02) — ${WINDOWS_EXCLUSION_REASON}`,
	() => {
		const temporaryDirs: string[] = [];

		afterEach(() => {
			for (const dir of temporaryDirs.splice(0)) {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});

		function buildOutputTransaction(
			process: ExiftoolProcess,
		): OutputTransaction {
			const exiftool = new ExifToolAdapter({ process });
			const stripMetadata = new StripMetadataCommand({
				metadataEngine: exiftool,
			});
			const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
				metadataEngine: exiftool,
			});
			return new OutputTransaction({
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
		}

		it("cleans a normal MP4 then a >4 GiB MP4 in one -stay_open session with no -api argument", async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-"));
			temporaryDirs.push(dir);
			assertLargeFileHost({ dir: os.tmpdir() });

			const normalSource = path.join(dir, "normal.mp4");
			fs.copyFileSync(SAMPLE_MP4, normalSource);

			const largeSource = path.join(dir, "large.mp4");
			createSparseLargeMp4({ destination: largeSource });
			const largeSourceDigestBefore = sha256OfFileStreamed({
				filePath: largeSource,
			});

			const before = snapshotDir(dir);

			const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const adapter = new ExifToolAdapter({ process: exiftoolProcess });
			const transaction = buildOutputTransaction(exiftoolProcess);

			const normalGeneratedPath = path.join(dir, "normal_cleaned.mp4");
			const largeGeneratedPath = path.join(dir, "large_cleaned.mp4");

			await exiftoolProcess.open();
			let normalInspect: Awaited<ReturnType<typeof adapter.inspect>>;
			let normalResult: Awaited<ReturnType<typeof transaction.execute>>;
			let largeInspect: Awaited<ReturnType<typeof adapter.inspect>>;
			let largeResult: Awaited<ReturnType<typeof transaction.execute>>;
			try {
				normalInspect = await adapter.inspect({
					source: normalSource,
					purpose: "display",
				});
				expect(normalInspect.ok).toBe(true);

				normalResult = await transaction.execute({
					filePath: normalSource,
					generatedPath: normalGeneratedPath,
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				expect(normalResult).toEqual({
					ok: true,
					value: { outputPath: normalGeneratedPath },
				});

				largeInspect = await adapter.inspect({
					source: largeSource,
					purpose: "display",
				});
				expect(largeInspect.ok).toBe(true);

				largeResult = await transaction.execute({
					filePath: largeSource,
					generatedPath: largeGeneratedPath,
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				expect(largeResult).toEqual({
					ok: true,
					value: { outputPath: largeGeneratedPath },
				});
			} finally {
				await exiftoolProcess.close();
			}

			const allResultsText = JSON.stringify([
				normalInspect,
				normalResult,
				largeInspect,
				largeResult,
			]);
			expect(allResultsText).not.toContain("LargeFileSupport not enabled");

			expect(fs.statSync(largeGeneratedPath).size).toBeGreaterThan(FOUR_GIB);

			expect(sha256OfFileStreamed({ filePath: largeSource })).toBe(
				largeSourceDigestBefore,
			);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: ["normal_cleaned.mp4", "large_cleaned.mp4"],
				modified: [],
				removed: [],
				unchanged: ["normal.mp4", "large.mp4"],
			});
		}, 180_000);
	},
);
