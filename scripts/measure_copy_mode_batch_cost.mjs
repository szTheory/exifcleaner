// Phase 63-18 (D-21): measures the per-file cost of a HEIC/AVIF save-as-copy in THREE modes,
// interleaved per run on one session, on the real production classes driven through tsx's
// tsImport() (the same discipline as Phase 58-05, which measured PNG/JPEG in two modes):
//
//   before   = ExifToolAdapter.sanitize copy write only. The 4.5.0 HEIC/AVIF path: one ExifTool
//              write, no reopen.
//   rollback = ExifTool write + ExifTool reopen + copy-mode leak check. OutputTransaction over a
//              HybridMetadataEngine whose NativeMetadataAdapter was constructed while node's
//              registry seam excluded heic/avif, so the router sends HEIC/AVIF to ExifTool.
//   after    = native write + ExifTool reopen + leak check. OutputTransaction over the real router.
//
// Splits: nativeWriteDeltaMs = after - rollback (cross-check: QUA-05's accepted 6-13 ms native
// HEIC/AVIF write); verificationDeltaMs = rollback - before (cross-check: Phase 58's +5.6-7 ms
// reopen-and-check cost on PNG/JPEG).
//
// Usage:
//   node scripts/measure_copy_mode_batch_cost.mjs [--large <abs path>] [--output <path>] [--quick]
// Default output: .planning/phases/63-app-adoption/63-BATCH-COST.json (workspace root).
// --quick runs 5 files and 1 run per mode, for checking the script; give it --output so the
// committed receipt is not overwritten.
//
// Not wired into CI: a committed, re-runnable reproducer and evidence artifact. Measured, never
// gated; its timing would be noise on a shared runner (D-21, mirrors 58-05 and 47-04).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PLANNING_ROOT = path.resolve(REPO_ROOT, "..");
const DEFAULT_OUTPUT_PATH = path.join(
	PLANNING_ROOT,
	".planning/phases/63-app-adoption/63-BATCH-COST.json",
);
const REGISTRY_PATH = path.join(
	REPO_ROOT,
	"node_modules/exifcleaner-node/dist/admission/registry.js",
);

// QUA-05 accepted exception (STATE.md): native HEIC/AVIF write costs 6-13 ms per file.
const QUA05_BAND_MS = { low: 6, high: 13 };
// Phase 58 verification delta on PNG/JPEG (58-EVIDENCE.md 58-05 and the 0.3.1 receipt).
const PHASE58_VERIFICATION_BAND_MS = { low: 5.6, high: 7 };
const HEIF_FORMATS = ["heic", "avif"];
const PROJECTION_FILES = 500;

function parseArgs(argv) {
	const options = {
		output: DEFAULT_OUTPUT_PATH,
		quick: false,
		large: undefined,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--quick") options.quick = true;
		else if (arg === "--output") options.output = path.resolve(argv[++i]);
		else if (arg === "--large") options.large = path.resolve(argv[++i]);
		else throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));
const FILES_PER_RUN = OPTIONS.quick ? 5 : 100;
const RUNS_PER_MODE = OPTIONS.quick ? 1 : 6;

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

function percentile(sortedMs, p) {
	const rank = Math.max(1, Math.ceil((p / 100) * sortedMs.length));
	return sortedMs[Math.min(sortedMs.length, rank) - 1];
}

function median(values) {
	return percentile(
		[...values].sort((a, b) => a - b),
		50,
	);
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

function sha256(file) {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readCommitSha() {
	return execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	}).trim();
}

function readNodePackageVersion(name) {
	const pkgPath = path.join(REPO_ROOT, "node_modules", name, "package.json");
	return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
}

// One run of one mode: FILES_PER_RUN + 1 fresh scratch copies; index 0 is a discarded warm-up.
// `writeOne` receives { source, destination, index } and resolves once the file is fully written
// (and verified, per the mode under test).
async function runBatch({ templateFile, extension, writeOne }) {
	const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-batch-cost-"));
	try {
		const samplesMs = [];
		const batchStart = process.hrtime.bigint();
		for (let i = 0; i <= FILES_PER_RUN; i += 1) {
			const source = path.join(scratchDir, `source-${i}${extension}`);
			const destination = path.join(scratchDir, `output-${i}${extension}`);
			fs.copyFileSync(templateFile, source);

			const start = process.hrtime.bigint();
			// eslint-disable-next-line no-await-in-loop
			await writeOne({ source, destination, index: i });
			const end = process.hrtime.bigint();

			if (i === 0) continue; // discard warm-up
			samplesMs.push(Number(end - start) / 1e6);
		}
		const batchEnd = process.hrtime.bigint();
		return { samplesMs, batchWallMs: Number(batchEnd - batchStart) / 1e6 };
	} finally {
		fs.rmSync(scratchDir, { recursive: true, force: true });
	}
}

function fmt(value) {
	return Number(value.toFixed(3));
}

function summarizeFixture({ before, rollback, after }) {
	const medOfMed = (runs) => median(runs.map((r) => r.medianMs));
	const medOfP90 = (runs) => median(runs.map((r) => r.p90Ms));
	const medianOfRunMedians = {
		before: medOfMed(before),
		rollback: medOfMed(rollback),
		after: medOfMed(after),
	};
	const medianOfRunP90 = {
		before: medOfP90(before),
		rollback: medOfP90(rollback),
		after: medOfP90(after),
	};
	const nativeWriteDeltaMs =
		medianOfRunMedians.after - medianOfRunMedians.rollback;
	const verificationDeltaMs =
		medianOfRunMedians.rollback - medianOfRunMedians.before;
	const totalDeltaMs = medianOfRunMedians.after - medianOfRunMedians.before;
	const nativeAnomaly =
		nativeWriteDeltaMs > 2 * QUA05_BAND_MS.high || nativeWriteDeltaMs < 0;
	const verificationAnomaly =
		verificationDeltaMs > 2 * PHASE58_VERIFICATION_BAND_MS.high ||
		verificationDeltaMs < PHASE58_VERIFICATION_BAND_MS.low / 2;
	return {
		medianOfRunMediansMs: Object.fromEntries(
			Object.entries(medianOfRunMedians).map(([k, v]) => [k, fmt(v)]),
		),
		medianOfRunP90Ms: Object.fromEntries(
			Object.entries(medianOfRunP90).map(([k, v]) => [k, fmt(v)]),
		),
		totalDeltaMsPerFile: fmt(totalDeltaMs),
		projection500FilesMs: {
			before: fmt(medianOfRunMedians.before * PROJECTION_FILES),
			rollback: fmt(medianOfRunMedians.rollback * PROJECTION_FILES),
			after: fmt(medianOfRunMedians.after * PROJECTION_FILES),
			totalDelta: fmt(totalDeltaMs * PROJECTION_FILES),
		},
		nativeWriteDeltaMs: fmt(nativeWriteDeltaMs),
		nativeWriteCrossCheckBandMs: QUA05_BAND_MS,
		verificationDeltaMs: fmt(verificationDeltaMs),
		verificationCrossCheckBandMs: PHASE58_VERIFICATION_BAND_MS,
		anomaly: {
			nativeWrite: nativeAnomaly,
			verification: verificationAnomaly,
			rule:
				"nativeWrite: delta above 2x the QUA-05 upper bound (26 ms) or negative; " +
				"verification: delta above 2x Phase 58's upper bound (14 ms) or below half its lower bound (2.8 ms)",
		},
		regression: medianOfRunMedians.after > medianOfRunMedians.before,
	};
}

async function main() {
	if (!fs.existsSync(EXIFTOOL_PATH)) {
		throw new Error(
			`Bundled ExifTool binary not found at ${EXIFTOOL_PATH}. This measurement ` +
				`requires the real bundled binary -- run \`yarn run update-exiftool\` first.`,
		);
	}
	if (!fs.existsSync(REGISTRY_PATH)) {
		throw new Error(`exifcleaner-node registry not found at ${REGISTRY_PATH}`);
	}
	const fixtures = [
		{
			name: "heic",
			source: path.resolve(
				REPO_ROOT,
				"tests/e2e/fixtures/sample-sips-icc.heic",
			),
		},
		{
			name: "avif",
			source: path.resolve(
				REPO_ROOT,
				"tests/e2e/fixtures/sample-sips-icc.avif",
			),
		},
	];
	if (OPTIONS.large !== undefined) {
		fixtures.push({ name: "heic-large-grid", source: OPTIONS.large });
	}
	for (const fixture of fixtures) {
		if (!fs.existsSync(fixture.source)) {
			throw new Error(`Fixture not found: ${fixture.source}`);
		}
	}

	// One tsImport call: the registry seam only affects the NativeMetadataAdapter loaded in the same
	// module graph (tsx namespaces each tsImport call separately).
	const {
		ExiftoolProcess,
		ExifToolAdapter,
		NativeMetadataAdapter,
		HybridMetadataEngine,
		StripMetadataCommand,
		VerifyGeneratedOutputQuery,
		OutputTransaction,
		seedHeifCopy,
		registry,
	} = await tsImport(
		"./measure_copy_mode_batch_cost_imports.ts",
		import.meta.url,
	);

	// Seed one scratch template per fixture (identifying metadata, so the write has real work to
	// do). Single source of the seed arguments is tests/helpers/heif_seed.ts; nothing seeded is
	// committed (D-13).
	const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "copy-batch-tpl-"));
	const templates = {};
	for (const fixture of fixtures) {
		const ext = path.extname(fixture.source);
		const target = path.join(templateDir, `${fixture.name}${ext}`);
		fs.copyFileSync(fixture.source, target);
		seedHeifCopy({ exiftoolPath: EXIFTOOL_PATH, sourcePath: target });
		templates[fixture.name] = {
			file: target,
			extension: ext,
			sourceBytes: fs.statSync(fixture.source).size,
			sourceSha256: sha256(fixture.source),
			seededBytes: fs.statSync(target).size,
		};
	}

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });

	// Builds one mode's writer plus the counters used to prove which engine wrote.
	function buildTransactionStack({ rollbackSeam }) {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		let native;
		if (rollbackSeam) {
			// The seam must precede construction: the adapter freezes capabilities and the hybrid
			// engine snapshots them. Restore immediately; the adapter keeps its snapshot.
			const restore = registry.setRegisteredHandlersForTests(
				registry
					.registeredHandlersForTests()
					.filter((h) => !HEIF_FORMATS.includes(h.capability.format)),
			);
			try {
				native = new NativeMetadataAdapter();
				const formats = native.getCapabilities().formats.map((f) => f.format);
				for (const format of HEIF_FORMATS) {
					if (formats.includes(format)) {
						throw new Error(
							`rollback seam did not take effect: native adapter still advertises ${format}`,
						);
					}
				}
			} finally {
				restore();
			}
		} else {
			native = new NativeMetadataAdapter();
		}
		const counts = { native: 0, exiftool: 0 };
		const exiftoolSanitize = exiftool.sanitize.bind(exiftool);
		exiftool.sanitize = (...args) => {
			counts.exiftool += 1;
			return exiftoolSanitize(...args);
		};
		const nativeSanitize = native.sanitize.bind(native);
		native.sanitize = (...args) => {
			counts.native += 1;
			return nativeSanitize(...args);
		};
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		const writtenBy = [];
		const verifyExecute = verifyGeneratedOutput.execute.bind(
			verifyGeneratedOutput,
		);
		verifyGeneratedOutput.execute = (request) => {
			writtenBy.push(request?.copyModeLeakCheck?.writtenBy);
			return verifyExecute(request);
		};
		const transaction = new OutputTransaction({
			stripMetadata: new StripMetadataCommand({ metadataEngine: hybrid }),
			verifyGeneratedOutput,
			unlink: fs.promises.unlink,
			rename: fs.promises.rename,
			delay: async (milliseconds) => {
				await new Promise((resolve) => setTimeout(resolve, milliseconds));
			},
		});
		return { transaction, counts, writtenBy, exiftool };
	}

	const beforeStack = buildTransactionStack({ rollbackSeam: false });
	const rollbackStack = buildTransactionStack({ rollbackSeam: true });
	const afterStack = buildTransactionStack({ rollbackSeam: false });

	function transactionWriter(stack, label, fixtureName, run) {
		return async ({ source, destination }) => {
			const result = await stack.transaction.execute({
				filePath: source,
				generatedPath: destination,
				...DEFAULT_PRESERVATION,
				copyModeLeakCheck: {
					demand: "required",
					preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
					preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
					preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
				},
			});
			if (!result.ok) {
				throw new Error(
					`${label}-mode write failed for ${fixtureName} run ${run}: ${JSON.stringify(result.error)}`,
				);
			}
		};
	}

	const modeDefs = {
		before:
			(fixtureName, run) =>
			async ({ source, destination }) => {
				const result = await beforeStack.exiftool.sanitize({
					source,
					destination,
					outputMode: "copy",
					...DEFAULT_PRESERVATION,
				});
				if (!result.ok) {
					throw new Error(
						`before-mode write failed for ${fixtureName} run ${run}: ${JSON.stringify(result.error)}`,
					);
				}
			},
		rollback: (fixtureName, run) =>
			transactionWriter(rollbackStack, "rollback", fixtureName, run),
		after: (fixtureName, run) =>
			transactionWriter(afterStack, "after", fixtureName, run),
	};
	const stacks = {
		before: beforeStack,
		rollback: rollbackStack,
		after: afterStack,
	};
	// Engine each mode must have used for every measured file (first-file assertion below).
	const expectedEngine = {
		before: { native: 0, exiftool: 1 },
		rollback: { native: 0, exiftool: 1 },
		after: { native: 1, exiftool: 0 },
	};

	const loadBefore = os.loadavg();
	await exiftoolProcess.open();

	const results = {};
	const runOrderLog = [];
	try {
		for (const fixture of fixtures) {
			const { file, extension } = templates[fixture.name];
			results[fixture.name] = { before: [], rollback: [], after: [] };
			for (let run = 0; run < RUNS_PER_MODE; run += 1) {
				const order =
					run % 2 === 0
						? ["before", "rollback", "after"]
						: ["after", "rollback", "before"];
				runOrderLog.push({ fixture: fixture.name, run, order });
				for (const mode of order) {
					const stack = stacks[mode];
					const countsBefore = { ...stack.counts };
					const writtenByBefore = stack.writtenBy.length;
					// eslint-disable-next-line no-await-in-loop
					const batch = await runBatch({
						templateFile: file,
						extension,
						writeOne: modeDefs[mode](fixture.name, run),
					});
					// A mislabelled mode fails the script: per file, exactly one write by the
					// expected engine (warm-up file included, so FILES_PER_RUN + 1 files).
					const files = FILES_PER_RUN + 1;
					const used = {
						native: stack.counts.native - countsBefore.native,
						exiftool: stack.counts.exiftool - countsBefore.exiftool,
					};
					const want = {
						native: expectedEngine[mode].native * files,
						exiftool: expectedEngine[mode].exiftool * files,
					};
					if (used.native !== want.native || used.exiftool !== want.exiftool) {
						throw new Error(
							`mode ${mode} engine mismatch for ${fixture.name} run ${run}: ` +
								`used ${JSON.stringify(used)}, expected ${JSON.stringify(want)}`,
						);
					}
					if (mode !== "before") {
						const seen = stack.writtenBy.slice(writtenByBefore);
						const wantWriter = mode === "after" ? "native" : "exiftool";
						if (
							seen.length !== files ||
							seen.some((writer) => writer !== wantWriter)
						) {
							throw new Error(
								`mode ${mode} writtenBy mismatch for ${fixture.name} run ${run}: ` +
									`${JSON.stringify([...new Set(seen)])} over ${seen.length} files, expected ${wantWriter} x ${files}`,
							);
						}
					}
					const summary = summarize(batch.samplesMs);
					results[fixture.name][mode].push({
						run,
						position: order.indexOf(mode),
						batchWallMs: batch.batchWallMs,
						...summary,
					});
					console.log(
						`[${mode}/${fixture.name} run ${run} pos ${order.indexOf(mode)}] ` +
							`median=${summary.medianMs.toFixed(3)}ms p90=${summary.p90Ms.toFixed(3)}ms ` +
							`batchWall=${batch.batchWallMs.toFixed(1)}ms`,
					);
				}
			}
			results[fixture.name].summary = summarizeFixture(results[fixture.name]);
			const s = results[fixture.name].summary;
			console.log(
				`[summary/${fixture.name}] before=${s.medianOfRunMediansMs.before} rollback=${s.medianOfRunMediansMs.rollback} ` +
					`after=${s.medianOfRunMediansMs.after} nativeWriteDelta=${s.nativeWriteDeltaMs} ` +
					`verificationDelta=${s.verificationDeltaMs}`,
			);
		}
	} finally {
		await exiftoolProcess.close();
		fs.rmSync(templateDir, { recursive: true, force: true });
	}
	const loadAfter = os.loadavg();

	const regressionLines = Object.entries(results).map(([name, r]) => {
		const s = r.summary;
		const b = s.medianOfRunMediansMs.before;
		const a = s.medianOfRunMediansMs.after;
		return (
			`REGRESSION: ${s.regression ? "yes" : "no"} -- ${name} per-file median-of-run-medians ` +
			`${b}ms (before) -> ${a}ms (after), ${s.totalDeltaMsPerFile >= 0 ? "+" : ""}${s.totalDeltaMsPerFile}ms/file; ` +
			`500-file projection ${s.projection500FilesMs.totalDelta >= 0 ? "+" : ""}${s.projection500FilesMs.totalDelta}ms`
		);
	});
	for (const line of regressionLines) console.log(line);

	let exiftoolVersion = "unknown";
	try {
		exiftoolVersion = execFileSync(EXIFTOOL_PATH, ["-ver"], {
			encoding: "utf8",
		}).trim();
	} catch {
		/* version is informational */
	}
	let nativeVersion;
	try {
		nativeVersion = readNodePackageVersion("exifcleaner-node");
	} catch {
		nativeVersion =
			"unknown (exifcleaner-node not resolvable from node_modules)";
	}

	const report = {
		measuredAt: new Date().toISOString(),
		commitSha: readCommitSha(),
		producingCommand:
			"node scripts/measure_copy_mode_batch_cost.mjs" +
			(OPTIONS.quick ? " --quick" : "") +
			(OPTIONS.large !== undefined ? " --large <scratch grid HEIC>" : ""),
		quick: OPTIONS.quick,
		filesPerRun: FILES_PER_RUN,
		runsPerMode: RUNS_PER_MODE,
		environment: {
			os: os.platform(),
			osRelease: os.release(),
			arch: os.arch(),
			cpuModel: os.cpus()[0]?.model ?? "unknown",
			cpuCount: os.cpus().length,
			loadAverage1m5m15m: loadBefore,
			loadAverage1m5m15mAfter: loadAfter,
			node: process.version,
			exiftool: exiftoolVersion,
			exiftoolPath: path.relative(REPO_ROOT, EXIFTOOL_PATH),
			exifcleanerNode: nativeVersion,
		},
		fixtures: Object.fromEntries(
			Object.entries(templates).map(([name, t]) => [
				name,
				{
					sourceBytes: t.sourceBytes,
					sourceSha256: t.sourceSha256,
					seededBytes: t.seededBytes,
				},
			]),
		),
		scope: {
			covers:
				"Per-file cost of a HEIC/AVIF save-as-copy in three modes on the real classes, " +
				"interleaved per run on one ExiftoolProcess: 'before' is ExifToolAdapter.sanitize alone " +
				"(the 4.5.0 path, no reopen); 'rollback' is OutputTransaction over a hybrid engine whose " +
				"native adapter was built with heic/avif excluded (ExifTool write + reopen + leak check); " +
				"'after' is OutputTransaction over the real router (native write + reopen + leak check).",
			doesNotCover:
				"Windows and Linux (macOS arm64 only; remedy path SEED-005), Electron IPC round-trip, " +
				"cold-app-launch cost, PNG/JPEG/WebP, a leak actually being found (every measured write " +
				"is clean and publishes), or files other than the listed fixtures.",
			method:
				`One ExiftoolProcess is opened in -stay_open mode. Per fixture, ${RUNS_PER_MODE} runs; each run times ` +
				`all three modes, ordered before/rollback/after on even runs and after/rollback/before on odd runs. ` +
				`Each mode-run copies ${FILES_PER_RUN + 1} fresh scratch files, discards the first (warm-up) and times ` +
				`the remaining ${FILES_PER_RUN} individually with process.hrtime.bigint(). Per mode the reported value ` +
				"is the median of the run medians. Each mode-run asserts via call counters (and writtenBy on the " +
				"verify request) which engine wrote every file, so a mislabelled mode fails the script.",
			loadCaveat:
				"Absolute timings depend on host load (compare environment.loadAverage1m5m15m before and " +
				"after against environment.cpuCount); the split deltas against their cross-check bands are " +
				"the decision inputs, not the absolute milliseconds.",
		},
		runOrder: runOrderLog,
		results,
		regressionLines,
	};

	fs.mkdirSync(path.dirname(OPTIONS.output), { recursive: true });
	fs.writeFileSync(
		OPTIONS.output,
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
	console.log(`\nWrote ${OPTIONS.output}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
