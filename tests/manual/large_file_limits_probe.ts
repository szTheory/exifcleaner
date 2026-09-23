// D-52 local measurement script (Phase 53, criterion 4: large-file limits).
//
// Run with: ASDF_NODEJS_VERSION=22.14.0 yarn tsx tests/manual/large_file_limits_probe.ts
// macOS-only: it uses `hdiutil` to create, attach and detach a small sparse APFS disk image
// for the disk-full (ENOSPC) measurements below.
// This is deliberately NOT a vitest test (no `.test.ts` suffix) and is NOT run in CI -- it is
// a one-time local measurement script, invoked manually per D-52/D-53. `verify:direffect`
// (scripts/dir_effect_gate.mjs) only collects `tests/**/*.test.ts`, `.spec.ts` and `.smoke.ts`
// files by construction, so this file is out of its scope without an exemption entry.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { OutputTransaction } from "../../src/main/output_transaction";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import {
	createSparseLargeMp4,
	sha256OfFileStreamed,
} from "../helpers/large_file_fixture";

if (process.platform !== "darwin") {
	console.log("PROBE_UNSUPPORTED_PLATFORM");
	process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH = path.resolve(
	__dirname,
	"../../.resources/nix/bin/exiftool",
);

function buildOutputTransaction(
	exiftoolProcess: ExiftoolProcess,
): OutputTransaction {
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const stripMetadata = new StripMetadataCommand({ metadataEngine: exiftool });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
		metadataEngine: exiftool,
	});
	return new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		unlink: fs.promises.unlink,
		rename: fs.promises.rename,
		delay: async (milliseconds: number) => {
			await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
		},
	});
}

function fileSizeOrAbsent(filePath: string): string {
	try {
		const size = fs.statSync(filePath).size;
		return `${size}B`;
	} catch {
		return "absent";
	}
}

async function main(): Promise<void> {
	const collectedStderr: string[] = [];
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]): void => {
		collectedStderr.push(args.map((value) => String(value)).join(" "));
		originalWarn(...args);
	};

	const temporaryDirs: string[] = [];
	let mountedVolumeDir: string | undefined;
	let attachedImagePath: string | undefined;
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });

	try {
		await exiftoolProcess.open();
		const transaction = buildOutputTransaction(exiftoolProcess);

		// ---- Throughput, three runs (same source, fresh output each run) ----
		const throughputDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "gsd53-probe-throughput-"),
		);
		temporaryDirs.push(throughputDir);
		const throughputSource = path.join(throughputDir, "throughput_source.mp4");
		createSparseLargeMp4({ destination: throughputSource });
		const throughputSourceDigestBefore = sha256OfFileStreamed({
			filePath: throughputSource,
		});

		const runMsValues: number[] = [];
		const runBytesValues: number[] = [];
		for (let n = 1; n <= 3; n += 1) {
			const outputPath = path.join(throughputDir, `run${n}_cleaned.mp4`);
			const startedAt = performance.now();
			const result = await transaction.execute({
				filePath: throughputSource,
				generatedPath: outputPath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			const elapsedMs = performance.now() - startedAt;
			if (!result.ok) {
				throw new Error(
					`Throughput run ${n} failed: ${JSON.stringify(result.error)}`,
				);
			}
			const bytes = fs.statSync(outputPath).size;
			runMsValues.push(elapsedMs);
			runBytesValues.push(bytes);
			console.log(`THROUGHPUT_RUN_${n}=${bytes}B/${elapsedMs.toFixed(0)}ms`);
			fs.rmSync(outputPath, { force: true });
		}

		const bytesPerMsValues = runBytesValues.map(
			(bytes, index) => bytes / runMsValues[index]!,
		);
		const sortedRates = [...bytesPerMsValues].sort((a, b) => a - b);
		const medianBytesPerMs = sortedRates[1]!;
		// MB = 10^6 bytes per D-52's own convention. bytesPerMs * 1000 = bytes/sec.
		const medianMBps = (medianBytesPerMs * 1000) / 1_000_000;
		console.log(`THROUGHPUT_MEDIAN_MBPS=${medianMBps.toFixed(1)}`);

		const timeoutCeilingBytes = Math.round(medianBytesPerMs * 30_000);
		const cascadeCeilingBytes = Math.round(medianBytesPerMs * 60_000);
		console.log(`TIMEOUT_CEILING_BYTES=${timeoutCeilingBytes}`);
		console.log(`CASCADE_CEILING_BYTES=${cascadeCeilingBytes}`);

		const tmpdirStatfs = fs.statfsSync(os.tmpdir());
		console.log(
			`THROUGHPUT_MEDIUM=type=0x${tmpdirStatfs.type.toString(16)},path=${os.tmpdir()}`,
		);

		// ---- Disk-full, copy mode: source in tmpdir, generatedPath on a 1 GiB sparse volume ----
		const enospcSetupDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "gsd53-probe-enospc-"),
		);
		temporaryDirs.push(enospcSetupDir);
		const imageBasePath = path.join(enospcSetupDir, "GSD53ENOSPC");
		attachedImagePath = `${imageBasePath}.sparseimage`;
		mountedVolumeDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "gsd53-probe-mount-"),
		);
		execFileSync("hdiutil", [
			"create",
			"-size",
			"1g",
			"-type",
			"SPARSE",
			"-fs",
			"APFS",
			"-volname",
			"GSD53ENOSPC",
			imageBasePath,
		]);
		execFileSync("hdiutil", [
			"attach",
			"-nobrowse",
			"-mountpoint",
			mountedVolumeDir,
			attachedImagePath,
		]);

		const enospcCopyGeneratedPath = path.join(
			mountedVolumeDir,
			"enospc_copy_cleaned.mp4",
		);
		const stderrIndexBeforeCopy = collectedStderr.length;
		const copyResult = await transaction.execute({
			filePath: throughputSource,
			generatedPath: enospcCopyGeneratedPath,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: true,
			preserveTimestamps: false,
		});
		const copyStderrLines = collectedStderr.slice(stderrIndexBeforeCopy);
		console.log(`ENOSPC_COPY_RESULT=${JSON.stringify(copyResult)}`);
		console.log(
			`ENOSPC_COPY_LEFTOVER=${fileSizeOrAbsent(enospcCopyGeneratedPath)}`,
		);
		console.log(`ENOSPC_COPY_STDERR=${JSON.stringify(copyStderrLines)}`);
		const copySourceUnchanged =
			sha256OfFileStreamed({ filePath: throughputSource }) ===
			throughputSourceDigestBefore;
		console.log(`ENOSPC_COPY_SOURCE_UNCHANGED=${copySourceUnchanged}`);

		// ---- Disk-full, overwrite shape: source AND staged file both on the small volume ----
		const overwriteSourcePath = path.join(
			mountedVolumeDir,
			"overwrite_source.mp4",
		);
		let overwriteSourceCreated = false;
		try {
			createSparseLargeMp4({ destination: overwriteSourcePath });
			overwriteSourceCreated = true;
		} catch (error: unknown) {
			const nodeError = error as NodeJS.ErrnoException;
			console.log(
				`ENOSPC_OVERWRITE_UNAVAILABLE=${nodeError.code ?? "UNKNOWN"}: ${nodeError.message}`,
			);
		}

		if (overwriteSourceCreated) {
			const overwriteSourceDigestBefore = sha256OfFileStreamed({
				filePath: overwriteSourcePath,
			});
			const stagedPath = path.join(
				mountedVolumeDir,
				".large.exifcleaner-stage-probe.mp4",
			);
			const overwriteResult = await transaction.execute({
				filePath: overwriteSourcePath,
				generatedPath: stagedPath,
				commitPath: overwriteSourcePath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			console.log(`ENOSPC_OVERWRITE_RESULT=${JSON.stringify(overwriteResult)}`);
			console.log(`ENOSPC_OVERWRITE_LEFTOVER=${fileSizeOrAbsent(stagedPath)}`);
			const overwriteSourceUnchanged = fs.existsSync(overwriteSourcePath)
				? sha256OfFileStreamed({ filePath: overwriteSourcePath }) ===
					overwriteSourceDigestBefore
				: false;
			console.log(
				`ENOSPC_OVERWRITE_SOURCE_UNCHANGED=${overwriteSourceUnchanged}`,
			);
		}
	} finally {
		console.warn = originalWarn;
		try {
			await exiftoolProcess.close();
		} catch {
			// already closed or never opened -- nothing else to do here.
		}
		if (mountedVolumeDir !== undefined) {
			try {
				execFileSync("hdiutil", ["detach", "-force", mountedVolumeDir]);
			} catch {
				// already detached -- fall through to directory cleanup below.
			}
			fs.rmSync(mountedVolumeDir, { recursive: true, force: true });
		}
		if (attachedImagePath !== undefined) {
			fs.rmSync(attachedImagePath, { force: true });
		}
		for (const dir of temporaryDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		console.log("PROBE_COMPLETE");
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
