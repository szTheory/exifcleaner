#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	makeSyntheticInvocation,
	assertEquivalentPair,
	sha256,
	validateEvidence,
	runProtectedFieldMutationProbes,
} from "./validate_phase22_benchmark.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "a6b37beb4de5fb05675abd25dd638173c048ebf6";
const INJECTED = "tests/benchmarks/.phase22-harness";
const PRODUCTION_PATHS = [
	"src",
	".resources",
	"out",
	"package.json",
	"yarn.lock",
];
export const HOST_REQUIREMENTS = Object.freeze({
	maximumNormalizedLoad: 0.5,
	stableSamples: 6,
	sampleIntervalMs: 10_000,
	waitTimeoutMs: 900_000,
});
const run = (command, args, options = {}) =>
	execFileSync(command, args, {
		cwd: options.cwd ?? ROOT,
		encoding: "utf8",
		stdio: options.stdio ?? "pipe",
		env: options.env,
		...options,
	});
const hashFile = (filename) =>
	crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const hashPath = (root, relative) =>
	run("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], {
		stdio: "pipe",
		input: relative,
	});

export function evaluateHostProbe(raw) {
	const hidMatch = raw.hid.match(/"HIDIdleTime"\s*=\s*(\d+)/);
	const loadMatch = raw.load.match(/\{\s*([0-9.]+)/);
	const logicalCpu = Number.parseInt(raw.logicalCpu.trim(), 10);
	const hidIdleSeconds = hidMatch
		? Number(hidMatch[1]) / 1_000_000_000
		: Number.NaN;
	const loadOneMinute = loadMatch ? Number(loadMatch[1]) : Number.NaN;
	const normalizedLoad = loadOneMinute / logicalCpu;
	const acPower = /drawing from 'AC Power'/.test(raw.power);
	const thermalClear =
		/No thermal warning level has been recorded/.test(raw.thermal) &&
		/No performance warning level has been recorded/.test(raw.thermal);
	const reasons = [];
	if (raw.platform !== "darwin") reasons.push("unsupported-platform");
	if (!acPower) reasons.push("not-on-ac-power");
	if (
		!Number.isFinite(normalizedLoad) ||
		normalizedLoad > HOST_REQUIREMENTS.maximumNormalizedLoad
	)
		reasons.push("excessive-system-load");
	if (!thermalClear) reasons.push("thermal-or-performance-pressure");
	return {
		eligible: reasons.length === 0,
		acPower,
		hidIdleSeconds,
		loadOneMinute,
		logicalCpu,
		normalizedLoad,
		thermalClear,
		reasons,
	};
}

export function probeControlledHost({
	platform = process.platform,
	exec = (command, args) => run(command, args),
} = {}) {
	const capture = (command, args) => String(exec(command, args) ?? "");
	const raw = {
		platform,
		power: platform === "darwin" ? capture("pmset", ["-g", "batt"]) : "",
		hid:
			platform === "darwin"
				? capture("ioreg", ["-r", "-c", "IOHIDSystem", "-d", "1"])
				: "",
		load: platform === "darwin" ? capture("sysctl", ["-n", "vm.loadavg"]) : "",
		logicalCpu:
			platform === "darwin" ? capture("sysctl", ["-n", "hw.logicalcpu"]) : "",
		thermal: platform === "darwin" ? capture("pmset", ["-g", "therm"]) : "",
	};
	return { ...evaluateHostProbe(raw), raw };
}

export class HostUnavailableError extends Error {
	constructor(result) {
		super("Controlled benchmark host did not become available before timeout");
		this.name = "HostUnavailableError";
		this.exitCode = 75;
		this.result = result;
	}
}

export async function waitForControlledHost({
	probe,
	sleep = (milliseconds) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds)),
	now = Date.now,
	requirements = {},
}) {
	const policy = { ...HOST_REQUIREMENTS, ...requirements };
	const startedAt = now();
	const samples = [];
	let stableSamples = 0;
	while (now() - startedAt <= policy.waitTimeoutMs) {
		const verdict = await probe();
		const sample = { ...verdict, observedAt: new Date(now()).toISOString() };
		samples.push(sample);
		stableSamples = verdict.eligible ? stableSamples + 1 : 0;
		if (stableSamples >= policy.stableSamples) {
			return { eligible: true, stableSamples, requirements: policy, samples };
		}
		await sleep(policy.sampleIntervalMs);
	}
	throw new HostUnavailableError({
		eligible: false,
		stableSamples,
		requirements: policy,
		samples,
	});
}
export function parseArgs(argv) {
	const values = {
		baseline: BASELINE,
		candidate: "HEAD",
		output:
			"../.planning/phases/22-raw-guard-verify-after-write/22-BENCHMARK.json",
		hostWaitTimeoutMs: HOST_REQUIREMENTS.waitTimeoutMs,
		verify: false,
		self: false,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const value = argv[i];
		if (value === "--baseline") values.baseline = argv[++i];
		else if (value === "--candidate") values.candidate = argv[++i];
		else if (value === "--output") values.output = argv[++i];
		else if (value === "--host-wait-timeout-ms")
			values.hostWaitTimeoutMs = Number(argv[++i]);
		else if (value === "--verify-harness") values.verify = true;
		else if (value === "--self-test") values.self = true;
		else if (value === "--help") values.help = true;
		else throw new Error(`Unknown argument: ${value}`);
	}
	if (
		!Number.isFinite(values.hostWaitTimeoutMs) ||
		values.hostWaitTimeoutMs < 0
	)
		throw new Error("--host-wait-timeout-ms must be a non-negative number");
	return values;
}
function help() {
	console.log(
		`Phase 22 local audit collector\n\nnode scripts/run_phase22_benchmark.mjs --baseline ${BASELINE} --candidate HEAD --output ../.planning/phases/22-raw-guard-verify-after-write/22-BENCHMARK.json [--host-wait-timeout-ms ${HOST_REQUIREMENTS.waitTimeoutMs}]\n\nUses detached worktrees, byte-pinned injected harness/configuration and fixture identity. Timing begins at submission and stops at 200 terminal rows; build, launch, fixture creation and cleanup are excluded. Before measured collection it automatically requires macOS, AC power, normalized load <= ${HOST_REQUIREMENTS.maximumNormalizedLoad}, and no thermal/performance pressure for ${HOST_REQUIREMENTS.stableSamples} consecutive ${HOST_REQUIREMENTS.sampleIntervalMs / 1000}s samples. HID idle time is recorded diagnostically but is not authoritative because desktop automation resets it. It records every host probe, production-path integrity, harness hashes, raw/normalized invocation records and host metadata. No human confirmation or override is accepted.`,
	);
}
function protocolBundle() {
	const files = ["jpeg_batch.spec.ts", "phase22.playwright.config.mjs"].map(
		(name) => path.join(ROOT, "tests/benchmarks", name),
	);
	const entries = files.map((filename) => ({
		name: path.basename(filename),
		bytes: fs.readFileSync(filename),
		sha256: hashFile(filename),
	}));
	return {
		protocol: 1,
		sourceRevision: run("git", ["rev-parse", "HEAD"]).trim(),
		files: entries.map(({ name, sha256: digest }) => ({
			name,
			sha256: digest,
		})),
		sha256: sha256(
			Buffer.concat([
				Buffer.from("phase22-protocol-v1"),
				...entries.map((entry) => entry.bytes),
			]),
		),
		entries,
	};
}
function applicationHashes(worktree) {
	return Object.fromEntries(
		PRODUCTION_PATHS.map((relative) => [
			relative,
			fs.existsSync(path.join(worktree, relative))
				? sha256(run("git", ["-C", worktree, "ls-files", "-s", "--", relative]))
				: "absent",
		]),
	);
}
function assertApplicationUnchanged(worktree, before) {
	if (JSON.stringify(applicationHashes(worktree)) !== JSON.stringify(before))
		throw new Error(`Measured application path changed in ${worktree}`);
	if (
		run("git", [
			"-C",
			worktree,
			"diff",
			"--",
			"src",
			".resources",
			"package.json",
			"yarn.lock",
		]).trim()
	)
		throw new Error(`Measured application diff detected in ${worktree}`);
}
function inject(worktree, bundle) {
	const destination = path.join(worktree, INJECTED);
	fs.mkdirSync(destination, { recursive: true });
	for (const entry of bundle.entries)
		fs.writeFileSync(path.join(destination, entry.name), entry.bytes);
	return destination;
}
function removeInjected(worktree) {
	fs.rmSync(path.join(worktree, "tests/benchmarks/.phase22-harness"), {
		recursive: true,
		force: true,
	});
}
function childInvocation(
	worktree,
	revision,
	kind,
	trial,
	sampleOut,
	fixture,
	bundle,
) {
	const cli = path.join(worktree, "node_modules/@playwright/test/cli.js");
	const spec = path.join(worktree, INJECTED, "jpeg_batch.spec.ts");
	const config = path.join(worktree, INJECTED, "phase22.playwright.config.mjs");
	const files = Array.from({ length: 200 }, (_, index) => ({
		path: path.join(
			os.tmpdir(),
			`phase22-${String(index).padStart(3, "0")}.jpg`,
		),
		sha256: hashFile(fixture),
	}));
	return {
		worktreeRoot: worktree,
		node: {
			argv0: process.execPath,
			executable: process.execPath,
			sha256: hashFile(process.execPath),
			version: process.version,
		},
		playwright: {
			cliPath: cli,
			sha256: hashFile(cli),
			version: JSON.parse(
				fs.readFileSync(
					path.join(worktree, "node_modules/@playwright/test/package.json"),
				),
			).version,
		},
		argv: [
			cli,
			"test",
			spec,
			"--config",
			config,
			"--workers=1",
			"--retries=0",
			"--repeat-each=1",
			"--reporter=line",
		],
		cwd: worktree,
		environment: {
			BENCHMARK_FIXTURE: path.join(worktree, "tests/e2e/fixtures/sample.jpg"),
			BENCHMARK_REVISION: revision,
			BENCHMARK_KIND: kind,
			BENCHMARK_TRIAL: String(trial),
			BENCHMARK_SAMPLE_OUT: sampleOut,
			CI: "1",
			NODE_ENV: "development",
		},
		config: {
			path: config,
			content: fs.readFileSync(config, "utf8"),
			sha256: hashFile(config),
		},
		fixture: {
			path: fixture,
			sha256: hashFile(fixture),
			size: fs.statSync(fixture).size,
			files,
		},
		timer: {
			start: "immediately-before-submission",
			stop: "200-terminal-rows",
			target: 200,
			excluded: ["build", "launch", "fixture-creation", "cleanup"],
			timeoutMs: 120000,
		},
		harness: { sha256: bundle.sha256 },
	};
}
function executeSample(invocation) {
	run(process.execPath, invocation.argv, {
		cwd: invocation.cwd,
		env: invocation.environment,
		stdio: "inherit",
	});
	return JSON.parse(
		fs.readFileSync(invocation.environment.BENCHMARK_SAMPLE_OUT, "utf8"),
	);
}
function setup(revision, bundle) {
	const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "phase22-worktree-"));
	fs.rmdirSync(worktree);
	run("git", ["worktree", "add", "--detach", worktree, revision]);
	run("yarn", ["install", "--frozen-lockfile"], {
		cwd: worktree,
		stdio: "inherit",
	});
	run("yarn", ["compile"], { cwd: worktree, stdio: "inherit" });
	const before = applicationHashes(worktree);
	inject(worktree, bundle);
	return { worktree, before };
}
function cleanup(setupResult) {
	if (!setupResult) return;
	try {
		assertApplicationUnchanged(setupResult.worktree, setupResult.before);
		removeInjected(setupResult.worktree);
	} finally {
		run("git", ["worktree", "remove", "--force", setupResult.worktree]);
	}
}
function selfTest() {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "phase22-harness-"));
	const source = path.join(directory, "source");
	const left = path.join(directory, "left");
	const right = path.join(directory, "right");
	fs.mkdirSync(path.join(source, "tests/benchmarks"), { recursive: true });
	fs.writeFileSync(
		path.join(source, "tests/benchmarks/jpeg_batch.spec.ts"),
		"spec",
	);
	fs.writeFileSync(
		path.join(source, "tests/benchmarks/phase22.playwright.config.mjs"),
		"config",
	);
	fs.cpSync(source, left, { recursive: true });
	fs.cpSync(source, right, { recursive: true });
	if (
		hashFile(path.join(left, "tests/benchmarks/jpeg_batch.spec.ts")) !==
		hashFile(path.join(right, "tests/benchmarks/jpeg_batch.spec.ts"))
	)
		throw new Error("Injection bytes differ");
	const a = makeSyntheticInvocation("/tmp/a", {
		revision: "a",
		kind: "warmup",
		trial: "1",
		sampleOut: "/tmp/a/out",
	});
	const b = makeSyntheticInvocation("/tmp/b", {
		revision: "b",
		kind: "warmup",
		trial: "1",
		sampleOut: "/tmp/b/out",
	});
	assertEquivalentPair(a, b);
	fs.rmSync(directory, { recursive: true, force: true });
	console.log("Phase 22 harness self-test passed");
}
async function qualifyBeforeSample(args) {
	const immediate = probeControlledHost();
	if (immediate.eligible) {
		return {
			eligible: true,
			stableSamples: 1,
			requirements: {
				...HOST_REQUIREMENTS,
				waitTimeoutMs: args.hostWaitTimeoutMs,
			},
			samples: [{ ...immediate, observedAt: new Date().toISOString() }],
			mode: "immediate-recheck",
		};
	}
	return {
		...(await waitForControlledHost({
			probe: () => probeControlledHost(),
			requirements: { waitTimeoutMs: args.hostWaitTimeoutMs },
		})),
		mode: "stability-window",
	};
}

export function renderBenchmarkMarkdown(evidence, verdict) {
	const lines = [
		"# Phase 22 Controlled JPEG Benchmark",
		"",
		`**Verdict:** ${verdict.pass ? "PASS" : "FAIL"}`,
		"",
		`- Baseline: \`${evidence.baseline}\``,
		`- Candidate: \`${evidence.candidate}\``,
		`- Baseline median: ${verdict.baselineMedian} ms`,
		`- Candidate median: ${verdict.candidateMedian} ms`,
		`- Baseline MAD: ${verdict.baselineMad} ms`,
		`- Candidate MAD: ${verdict.candidateMad} ms`,
		`- Bound: ${verdict.bound} ms`,
		`- Relative median change: ${(verdict.relativeMedianChange * 100).toFixed(2)}%`,
		`- Formula: ${verdict.candidateMedian} <= ${verdict.baselineMedian} + 2 * max(${verdict.baselineMad}, ${verdict.candidateMad})`,
		"",
		"## Automated Host Qualification",
		"",
		`- Platform: ${evidence.hostEligibility.platform}`,
		`- Policy: AC power, normalized load <= ${HOST_REQUIREMENTS.maximumNormalizedLoad}, no thermal/performance pressure; HID idle recorded diagnostically`,
		`- Stable preflight samples: ${evidence.hostEligibility.initial.stableSamples}/${HOST_REQUIREMENTS.stableSamples}`,
		`- Per-child checks: ${evidence.hostEligibility.checks.length} passed`,
		"- Human confirmation: none",
		"",
		"## Samples",
		"",
		`- Warmups: ${evidence.samples.baseline.warmup.length} baseline / ${evidence.samples.candidate.warmup.length} candidate`,
		`- Measured: ${evidence.samples.baseline.measured.length} baseline / ${evidence.samples.candidate.measured.length} candidate`,
		"",
		"The JSON evidence is authoritative and includes every raw invocation, fixture identity, host probe, and measured sample.",
	];
	return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	if (args.help) return help();
	if (args.self) return selfTest();
	const candidate = run("git", ["rev-parse", args.candidate]).trim();
	const baseline = run("git", ["rev-parse", args.baseline]).trim();
	const bundle = protocolBundle();
	let baseSetup;
	let candidateSetup;
	let evidence;
	try {
		baseSetup = setup(baseline, bundle);
		candidateSetup = setup(candidate, bundle);
		const fixtureA = path.join(
			baseSetup.worktree,
			"tests/e2e/fixtures/sample.jpg",
		);
		const fixtureB = path.join(
			candidateSetup.worktree,
			"tests/e2e/fixtures/sample.jpg",
		);
		if (hashFile(fixtureA) !== hashFile(fixtureB))
			throw new Error("Fixture identity mismatch");
		const compatibility = ["baseline", "candidate"].map((kind, index) => {
			const result = index ? candidateSetup : baseSetup;
			const revision = index ? candidate : baseline;
			const output = path.join(result.worktree, `.phase22-${kind}.json`);
			const invocation = childInvocation(
				result.worktree,
				revision,
				"compatibility",
				0,
				output,
				index ? fixtureB : fixtureA,
				bundle,
			);
			const sample = executeSample(invocation);
			return { rawInvocation: invocation, sample };
		});
		assertEquivalentPair(
			compatibility[0].rawInvocation,
			compatibility[1].rawInvocation,
		);
		runProtectedFieldMutationProbes();
		if (args.verify) {
			console.log("Phase 22 harness verification passed");
			return;
		}
		const initial = await waitForControlledHost({
			probe: () => probeControlledHost(),
			requirements: { waitTimeoutMs: args.hostWaitTimeoutMs },
		});
		evidence = {
			version: 2,
			baseline,
			candidate,
			dirtyState: run("git", ["status", "--porcelain"]).trim(),
			harness: bundle,
			fixture: {
				path: "tests/e2e/fixtures/sample.jpg",
				sha256: hashFile(fixtureA),
				size: fs.statSync(fixtureA).size,
			},
			pairs: [{ baseline: compatibility[0], candidate: compatibility[1] }],
			hostEligibility: { platform: process.platform, initial, checks: [] },
			samples: {
				baseline: { warmup: [], measured: [] },
				candidate: { warmup: [], measured: [] },
			},
		};
		for (const kind of [
			"warmup",
			"warmup",
			"warmup",
			...Array(9).fill("measured"),
		]) {
			for (const side of [0, 1]) {
				const sideName = side ? "candidate" : "baseline";
				const setupResult = side ? candidateSetup : baseSetup;
				const revision = side ? candidate : baseline;
				const trial = evidence.samples[sideName][kind].length + 1;
				const before = await qualifyBeforeSample(args);
				const output = path.join(
					setupResult.worktree,
					`.phase22-${kind}-${side}-${trial - 1}.json`,
				);
				const invocation = childInvocation(
					setupResult.worktree,
					revision,
					kind,
					trial,
					output,
					side ? fixtureB : fixtureA,
					bundle,
				);
				const sample = executeSample(invocation);
				const after = {
					...probeControlledHost(),
					observedAt: new Date().toISOString(),
				};
				evidence.hostEligibility.checks.push({
					side: sideName,
					kind,
					trial,
					before,
					after,
				});
				if (!after.eligible) {
					throw new HostUnavailableError({
						stage: "post-sample",
						side: sideName,
						kind,
						trial,
						verdict: after,
						partialEvidence: evidence,
					});
				}
				evidence.samples[sideName][kind].push({
					...sample,
					rawInvocation: invocation,
				});
			}
		}
		const verdict = validateEvidence(evidence);
		const outputPath = path.resolve(ROOT, args.output);
		fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
		fs.writeFileSync(
			outputPath.replace(/\.json$/i, ".md"),
			renderBenchmarkMarkdown(evidence, verdict),
		);
	} catch (error) {
		if (error instanceof HostUnavailableError) {
			const diagnosticPath = `${path.resolve(ROOT, args.output)}.host-unavailable.json`;
			fs.writeFileSync(
				diagnosticPath,
				`${JSON.stringify({ status: "host-unavailable", ...error.result }, null, 2)}\n`,
			);
		}
		throw error;
	} finally {
		cleanup(candidateSetup);
		cleanup(baseSetup);
	}
}
const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	main().catch((error) => {
		if (error instanceof HostUnavailableError) {
			console.error(
				JSON.stringify({
					status: "host-unavailable",
					exitCode: error.exitCode,
					...error.result,
				}),
			);
			process.exitCode = error.exitCode;
			return;
		}
		console.error(error instanceof Error ? error.stack : String(error));
		process.exitCode = 1;
	});
}
