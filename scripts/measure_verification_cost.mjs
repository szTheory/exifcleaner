// D-25: measures the per-file cost OutputTransaction newly imposes on every
// webp save-as-copy — the ExifTool reopen VerifyGeneratedOutputQuery.execute()
// performs after every staged write — on THIS tree, driving the real compiled
// production classes (ExiftoolProcess, ExifToolAdapter,
// VerifyGeneratedOutputQuery) against the real bundled ExifTool binary via
// tsx's tsImport(), not a re-implementation of ExifTool's -stay_open wire
// protocol.
//
// 47-RESEARCH.md's GAP 1 measured this same cost with a same-protocol proxy
// script that reimplemented the wire format directly and was never
// committed — an honestly flagged limitation ("this is a proxy, not an
// instrumented run of the compiled classes"). This script closes that gap:
// it imports and calls the real classes ExifCleaner ships. If, in some
// environment, driving the compiled path genuinely cannot be done, this
// script must fail loudly rather than silently fall back to reimplementing
// the protocol — see the startup checks below.
//
// Usage:  node scripts/measure_verification_cost.mjs
// (also: yarn measure:verification-cost)
// Writes .planning/phases/47-generic-electron-default-routing/47-VERIFICATION-COST.json
//
// Not wired into CI: this is a committed, re-runnable reproducer and an
// evidence artifact, not a pass/fail gate — its timing would be noise on a
// shared runner (D-25, plan 47-04).

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
	".planning/phases/47-generic-electron-default-routing/47-VERIFICATION-COST.json",
);

const SAMPLE_COUNT = 300;

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(REPO_ROOT, ".resources/win/bin/exiftool.exe")
		: path.resolve(REPO_ROOT, ".resources/nix/bin/exiftool");

const FIXTURES = [
	{
		name: "small-still-webp",
		description:
			"A small still image (the format this phase newly routes through verified writes).",
		file: path.resolve(REPO_ROOT, "tests/e2e/fixtures/sample.webp"),
	},
	{
		name: "larger-raw-raf",
		description:
			"A substantially larger file, to check whether verification cost is size-sensitive.",
		file: path.resolve(REPO_ROOT, "tests/e2e/fixtures/sample.raf"),
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
		p95Ms: percentile(sorted, 95),
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

async function main() {
	if (!fs.existsSync(EXIFTOOL_PATH)) {
		throw new Error(
			`Bundled ExifTool binary not found at ${EXIFTOOL_PATH}. This measurement ` +
				`requires the real bundled binary — run \`yarn run update-exiftool\` first. ` +
				`Refusing to fall back to a re-implementation of the wire protocol (D-25).`,
		);
	}

	// Drive the real compiled/transpiled production classes directly, via
	// tsx's tsImport() loader — no build step and no protocol reimplementation.
	const { ExiftoolProcess } = await tsImport(
		"../src/infrastructure/exiftool/ExiftoolProcess.ts",
		import.meta.url,
	);
	const { ExifToolAdapter } = await tsImport(
		"../src/infrastructure/exiftool/exiftool_adapter.ts",
		import.meta.url,
	);
	const { VerifyGeneratedOutputQuery } = await tsImport(
		"../src/application/queries/verify_generated_output_query.ts",
		import.meta.url,
	);

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const adapter = new ExifToolAdapter({ process: exiftoolProcess });
	const query = new VerifyGeneratedOutputQuery({ metadataEngine: adapter });

	await exiftoolProcess.open();

	const fixtureResults = {};
	try {
		for (const fixture of FIXTURES) {
			if (!fs.existsSync(fixture.file)) {
				throw new Error(`Fixture not found: ${fixture.file}`);
			}

			// Copy into a fresh scratch dir so the measured path has the shape
			// OutputTransaction actually verifies (a generated output path,
			// distinct from the checked-in fixture) rather than reading the
			// repository fixture in place.
			const scratchDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "verification-cost-"),
			);
			const scratchPath = path.join(scratchDir, path.basename(fixture.file));
			fs.copyFileSync(fixture.file, scratchPath);

			const samplesMs = [];
			try {
				for (let i = 0; i < SAMPLE_COUNT; i += 1) {
					const start = process.hrtime.bigint();
					// eslint-disable-next-line no-await-in-loop
					const result = await query.execute({ generatedPath: scratchPath });
					const end = process.hrtime.bigint();
					if (!result.ok) {
						throw new Error(
							`Verification unexpectedly failed for fixture "${fixture.name}" ` +
								`on sample ${i}: ${JSON.stringify(result.error)}`,
						);
					}
					samplesMs.push(Number(end - start) / 1e6);
				}
			} finally {
				fs.rmSync(scratchDir, { recursive: true, force: true });
			}

			const summary = summarize(samplesMs);
			fixtureResults[fixture.name] = {
				description: fixture.description,
				fixturePath: path.relative(REPO_ROOT, fixture.file),
				fixtureSizeBytes: fs.statSync(fixture.file).size,
				...summary,
			};

			console.log(
				`[${fixture.name}] samples=${summary.sampleCount} ` +
					`median=${summary.medianMs.toFixed(3)}ms ` +
					`p95=${summary.p95Ms.toFixed(3)}ms ` +
					`min=${summary.minMs.toFixed(3)}ms ` +
					`max=${summary.maxMs.toFixed(3)}ms ` +
					`mean=${summary.meanMs.toFixed(3)}ms`,
			);
			if (summary.maxMs > summary.medianMs * 10) {
				console.log(
					`[${fixture.name}] note: max is more than 10x the median — the mean is ` +
						`inflated by scheduler outliers; treat median/p95 as the headline figures, ` +
						`not mean (GAP 1 observed the same pattern).`,
				);
			}
		}
	} finally {
		await exiftoolProcess.close();
	}

	const exiftoolVersion = readExiftoolVersion(EXIFTOOL_PATH);
	const commitSha = readCommitSha();

	const report = {
		measuredAt: new Date().toISOString(),
		commitSha,
		producingCommand: "yarn measure:verification-cost",
		environment: {
			os: os.platform(),
			osRelease: os.release(),
			arch: os.arch(),
			node: process.version,
			exiftool: exiftoolVersion,
			exiftoolPath: path.relative(REPO_ROOT, EXIFTOOL_PATH),
		},
		scope: {
			covers:
				"Wall-clock cost of VerifyGeneratedOutputQuery.execute() — the real " +
				"ExifTool reopen-and-inspect call OutputTransaction performs after every " +
				"staged write — driven against the real ExifToolAdapter and the real " +
				"bundled ExifTool binary (a single long-lived -stay_open process, " +
				"matching production), for a small still-image fixture and a " +
				"substantially larger raw fixture.",
			doesNotCover:
				"The cost of the write itself (stripMetadata.execute/OutputTransaction's " +
				"write step), Electron IPC round-trip overhead, the filesystem state of a " +
				"just-written generated output moments after ExifTool wrote it (these " +
				"fixtures are pre-existing checked-in files copied into a scratch " +
				"directory, not freshly generated outputs), or verification cost for any " +
				"format other than the two fixtures measured here.",
			method:
				"A single ExiftoolProcess is opened once in -stay_open mode. For each " +
				"fixture, VerifyGeneratedOutputQuery.execute() is called " +
				`${SAMPLE_COUNT} times in a tight loop against a scratch copy of the ` +
				"fixture, each call timed with process.hrtime.bigint(). The classes " +
				"under measurement are imported via tsx's tsImport() so the real " +
				"TypeScript source runs, not a re-implementation.",
		},
		fixtures: fixtureResults,
	};

	fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
	fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	console.log(`\nWrote ${path.relative(PLANNING_ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
