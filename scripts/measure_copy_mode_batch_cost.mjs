// Phase 58-05 (D-13): measures the per-file and batch-wall-clock cost of a PNG/JPEG
// save-as-copy BEFORE this milestone's verified-transaction routing (the 4.4.0 path: a
// single ExifTool write, no reopen) and AFTER (this branch's real path: OutputTransaction ->
// native write + ExifTool reopen + copy-mode leak check via VerifyGeneratedOutputQuery), on
// the real compiled production classes driven through tsx's tsImport() -- the same measurement
// discipline as scripts/measure_verification_cost.mjs. Never re-implements ExifTool's
// -stay_open wire protocol or the native binding; imports and calls the real classes
// ExifCleaner ships.
//
// Usage:  node scripts/measure_copy_mode_batch_cost.mjs
// Writes .planning/phases/58-app-adoption/58-BATCH-COST.json
//
// Not wired into CI: this is a committed, re-runnable reproducer and evidence artifact, not a
// pass/fail gate -- its timing would be noise on a shared runner (D-13, mirrors 47-04's D-25).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PLANNING_ROOT = path.resolve(REPO_ROOT, "..");
const OUTPUT_PATH = path.join(
	PLANNING_ROOT,
	".planning/phases/58-app-adoption/58-BATCH-COST.json",
);

const FILES_PER_BATCH = 100;
const RUNS_PER_MODE = 3;

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(REPO_ROOT, ".resources/win/bin/exiftool.exe")
		: path.resolve(REPO_ROOT, ".resources/nix/bin/exiftool");

const DEFAULT_PRESERVATION = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	preserveTimestamps: false,
};

const FIXTURES = [
	{
		name: "jpeg",
		file: path.resolve(REPO_ROOT, "tests/e2e/fixtures/sample.jpg"),
	},
	{
		name: "png",
		file: path.resolve(REPO_ROOT, "tests/e2e/fixtures/sample.png"),
	},
];

function percentile(sortedMs, p) {
	const rank = Math.max(1, Math.ceil((p / 100) * sortedMs.length));
	return sortedMs[Math.min(sortedMs.length, rank) - 1];
}

function summarize(samplesMs) {
	const sorted = [...samplesMs].sort((a, b) => a - b);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		sampleCount: sorted.length,
		medianMs: percentile(sorted, 50),
		p90Ms: percentile(sorted, 90),
		minMs: sorted[0],
		maxMs: sorted[sorted.length - 1],
		meanMs: sum / sorted.length,
	};
}

function readExiftoolVersion(binPath) {
	return execFileSync(binPath, ["-ver"], { encoding: "utf8" }).trim();
}

function readCommitSha() {
	return execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	}).trim();
}

function readNodePackageVersion(name) {
	const pkgPath = path.join(REPO_ROOT, "node_modules", name, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	return pkg.version;
}

// One run: FILES_PER_BATCH + 1 fresh scratch copies (index 0 is a discarded warm-up file, so
// the first Perl/native call's cold-start cost never contaminates the measured samples).
// `writeOne` receives { source, destination } and must resolve once the file for that index is
// fully written and verified per the mode under test.
async function runBatch({ fixtureFile, extension, writeOne }) {
	const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-batch-cost-"));
	try {
		const samplesMs = [];
		const batchStart = process.hrtime.bigint();
		for (let i = 0; i <= FILES_PER_BATCH; i += 1) {
			const source = path.join(scratchDir, `source-${i}${extension}`);
			const destination = path.join(scratchDir, `output-${i}${extension}`);
			fs.copyFileSync(fixtureFile, source);

			const start = process.hrtime.bigint();
			// eslint-disable-next-line no-await-in-loop
			await writeOne({ source, destination });
			const end = process.hrtime.bigint();

			if (i === 0) continue; // discard warm-up
			samplesMs.push(Number(end - start) / 1e6);
		}
		const batchEnd = process.hrtime.bigint();
		return {
			samplesMs,
			batchWallMs: Number(batchEnd - batchStart) / 1e6,
		};
	} finally {
		fs.rmSync(scratchDir, { recursive: true, force: true });
	}
}

async function main() {
	if (!fs.existsSync(EXIFTOOL_PATH)) {
		throw new Error(
			`Bundled ExifTool binary not found at ${EXIFTOOL_PATH}. This measurement ` +
				`requires the real bundled binary -- run \`yarn run update-exiftool\` first. ` +
				`Refusing to fall back to a re-implementation of the wire protocol (D-13).`,
		);
	}
	for (const fixture of FIXTURES) {
		if (!fs.existsSync(fixture.file)) {
			throw new Error(`Fixture not found: ${fixture.file}`);
		}
	}

	const { ExiftoolProcess } = await tsImport(
		"../src/infrastructure/exiftool/ExiftoolProcess.ts",
		import.meta.url,
	);
	const { ExifToolAdapter } = await tsImport(
		"../src/infrastructure/exiftool/exiftool_adapter.ts",
		import.meta.url,
	);
	const { NativeMetadataAdapter } = await tsImport(
		"../src/infrastructure/metadata/native_metadata_adapter.ts",
		import.meta.url,
	);
	const { HybridMetadataEngine } = await tsImport(
		"../src/infrastructure/metadata/hybrid_metadata_engine.ts",
		import.meta.url,
	);
	const { StripMetadataCommand } = await tsImport(
		"../src/application/commands/strip_metadata_command.ts",
		import.meta.url,
	);
	const { VerifyGeneratedOutputQuery } = await tsImport(
		"../src/application/queries/verify_generated_output_query.ts",
		import.meta.url,
	);
	const { OutputTransaction } = await tsImport(
		"../src/main/output_transaction.ts",
		import.meta.url,
	);

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	// "before": the 4.4.0 path -- ExifToolAdapter.sanitize copy writes only, no reopen.
	const exiftoolOnlyAdapter = new ExifToolAdapter({ process: exiftoolProcess });
	// "after": the real hybrid engine + OutputTransaction (native write + reopen + leak check).
	const native = new NativeMetadataAdapter();
	const hybrid = new HybridMetadataEngine({
		exiftool: exiftoolOnlyAdapter,
		native,
	});
	const stripMetadata = new StripMetadataCommand({ metadataEngine: hybrid });
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
		metadataEngine: hybrid,
	});
	const transaction = new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		unlink: fs.promises.unlink,
		rename: fs.promises.rename,
		delay: async (milliseconds) => {
			await new Promise((resolve) => setTimeout(resolve, milliseconds));
		},
	});

	await exiftoolProcess.open();

	const results = {};
	try {
		for (const fixture of FIXTURES) {
			const extension = path.extname(fixture.file);
			results[fixture.name] = { before: [], after: [] };

			for (let run = 0; run < RUNS_PER_MODE; run += 1) {
				// eslint-disable-next-line no-await-in-loop
				const before = await runBatch({
					fixtureFile: fixture.file,
					extension,
					writeOne: async ({ source, destination }) => {
						const result = await exiftoolOnlyAdapter.sanitize({
							source,
							destination,
							outputMode: "copy",
							...DEFAULT_PRESERVATION,
						});
						if (!result.ok) {
							throw new Error(
								`before-mode write failed for ${fixture.name} run ${run}: ` +
									`${JSON.stringify(result.error)}`,
							);
						}
					},
				});
				const beforeSummary = summarize(before.samplesMs);
				results[fixture.name].before.push({
					run,
					batchWallMs: before.batchWallMs,
					...beforeSummary,
				});
				console.log(
					`[before/${fixture.name} run ${run}] median=${beforeSummary.medianMs.toFixed(3)}ms ` +
						`p90=${beforeSummary.p90Ms.toFixed(3)}ms batchWall=${before.batchWallMs.toFixed(1)}ms`,
				);
			}

			for (let run = 0; run < RUNS_PER_MODE; run += 1) {
				// eslint-disable-next-line no-await-in-loop
				const after = await runBatch({
					fixtureFile: fixture.file,
					extension,
					writeOne: async ({ source, destination }) => {
						const result = await transaction.execute({
							filePath: source,
							generatedPath: destination,
							...DEFAULT_PRESERVATION,
							copyModeLeakCheck: {
								preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
								preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
								preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
							},
						});
						if (!result.ok) {
							throw new Error(
								`after-mode write failed for ${fixture.name} run ${run}: ` +
									`${JSON.stringify(result.error)}`,
							);
						}
					},
				});
				const afterSummary = summarize(after.samplesMs);
				results[fixture.name].after.push({
					run,
					batchWallMs: after.batchWallMs,
					...afterSummary,
				});
				console.log(
					`[after/${fixture.name} run ${run}] median=${afterSummary.medianMs.toFixed(3)}ms ` +
						`p90=${afterSummary.p90Ms.toFixed(3)}ms batchWall=${after.batchWallMs.toFixed(1)}ms`,
				);
			}
		}
	} finally {
		await exiftoolProcess.close();
	}

	const exiftoolVersion = readExiftoolVersion(EXIFTOOL_PATH);
	const commitSha = readCommitSha();
	let nativeVersion;
	try {
		nativeVersion = readNodePackageVersion("exifcleaner-node");
	} catch {
		nativeVersion =
			"unknown (exifcleaner-node not resolvable from node_modules)";
	}

	const loadAverage = os.loadavg();

	const report = {
		measuredAt: new Date().toISOString(),
		commitSha,
		producingCommand: "node scripts/measure_copy_mode_batch_cost.mjs",
		environment: {
			os: os.platform(),
			osRelease: os.release(),
			arch: os.arch(),
			cpuModel: os.cpus()[0]?.model ?? "unknown",
			cpuCount: os.cpus().length,
			loadAverage1m5m15m: loadAverage,
			node: process.version,
			exiftool: exiftoolVersion,
			exiftoolPath: path.relative(REPO_ROOT, EXIFTOOL_PATH),
			exifcleanerNode: nativeVersion,
		},
		scope: {
			covers:
				"Per-file and batch wall-clock cost of a PNG/JPEG save-as-copy, measured two " +
				"ways on the real compiled classes: 'before' is ExifToolAdapter.sanitize alone " +
				"(the 4.4.0 direct-write path, no reopen); 'after' is OutputTransaction.execute " +
				"with the real HybridMetadataEngine and copyModeLeakCheck (native write, then " +
				"the ExifTool reopen VerifyGeneratedOutputQuery performs, then the leak check).",
			doesNotCover:
				"Electron IPC round-trip overhead, cold-app-launch cost, verification cost for " +
				"any format other than PNG/JPEG, or the cost of a leak actually being found " +
				"(every measured write here is clean and publishes).",
			method:
				`A single ExiftoolProcess is opened once in -stay_open mode. For each format, ` +
				`${RUNS_PER_MODE} runs per mode are collected; each run copies ${FILES_PER_BATCH + 1} ` +
				"fresh scratch files from the fixture, discards the first (warm-up), and times " +
				`the remaining ${FILES_PER_BATCH} individually with process.hrtime.bigint() plus ` +
				"the whole batch's wall time. Classes under measurement are imported via tsx's " +
				"tsImport() so the real TypeScript source runs, not a re-implementation.",
			loadCaveat:
				"This host may be under heavy unrelated CPU load at measurement time (see " +
				"environment.loadAverage1m5m15m against environment.cpuCount) -- absolute " +
				"timings can be noisy; the before/after ratio per format and per run is the " +
				"more load-resilient comparison.",
		},
		results,
	};

	fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
	fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(`\nWrote ${path.relative(PLANNING_ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
