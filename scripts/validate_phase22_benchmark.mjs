import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALLOWED_ENV = new Map([
	["BENCHMARK_REVISION", "<REVISION>"],
	["BENCHMARK_KIND", "<KIND>"],
	["BENCHMARK_TRIAL", "<TRIAL>"],
	["BENCHMARK_SAMPLE_OUT", "<SAMPLE_OUT>"],
]);

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function replaceRoot(value, root) {
	if (typeof value !== "string") throw new Error("Expected path string");
	if (value.includes(root)) return value.replaceAll(root, "<WORKTREE_ROOT>");
	return value;
}
function rejectUnexpectedRoot(value, root, field) {
	if (typeof value === "string" && value.includes(root)) throw new Error(`worktree root found in protected ${field}`);
}
export function normalizeInvocation(raw) {
	const root = raw.worktreeRoot;
	if (!root || !path.isAbsolute(root)) throw new Error("Invocation is missing an absolute worktreeRoot");
	const copy = structuredClone(raw);
	copy.cwd = replaceRoot(copy.cwd, root);
	copy.node.executable = replaceRoot(copy.node.executable, root);
	copy.playwright.cliPath = replaceRoot(copy.playwright.cliPath, root);
	copy.argv = copy.argv.map((token, index) => index === 0 || index === 2 || index === 4 ? replaceRoot(token, root) : token);
	copy.config.path = replaceRoot(copy.config.path, root);
	copy.fixture.path = replaceRoot(copy.fixture.path, root);
	copy.fixture.files = copy.fixture.files.map((entry) => ({ ...entry, path: replaceRoot(entry.path, root) }));
	for (const [key, placeholder] of ALLOWED_ENV) {
		if (!(key in copy.environment)) throw new Error(`Missing ${key}`);
		copy.environment[key] = placeholder;
	}
	copy.environment.BENCHMARK_FIXTURE = replaceRoot(copy.environment.BENCHMARK_FIXTURE, root);
	for (const [key, value] of Object.entries(copy.environment)) {
		if (typeof value === "string" && value.includes(root) && key !== "BENCHMARK_FIXTURE") throw new Error(`worktree root found in protected environment ${key}`);
	}
	for (const [key, value] of Object.entries(copy)) {
		if (!["cwd", "node", "playwright", "argv", "config", "fixture", "environment", "worktreeRoot"].includes(key)) rejectUnexpectedRoot(canonicalJson(value), root, key);
	}
	delete copy.worktreeRoot;
	return JSON.parse(canonicalJson(copy));
}
export function assertEquivalentPair(left, right) {
	const a = canonicalJson(normalizeInvocation(left));
	const b = canonicalJson(normalizeInvocation(right));
	if (a !== b) throw new Error("normalized invocation mismatch");
	return a;
}
export function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	if (!sorted.length) throw new Error("median requires values");
	const midpoint = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}
export function computeVerdict(baseline, candidate) {
	const baselineMedian = median(baseline);
	const candidateMedian = median(candidate);
	const baselineMad = median(baseline.map((value) => Math.abs(value - baselineMedian)));
	const candidateMad = median(candidate.map((value) => Math.abs(value - candidateMedian)));
	const bound = baselineMedian + 2 * Math.max(baselineMad, candidateMad);
	return { baselineMedian, candidateMedian, baselineMad, candidateMad, bound, relativeMedianChange: (candidateMedian - baselineMedian) / baselineMedian, pass: candidateMedian <= bound };
}
export function makeSyntheticInvocation(root, values) {
	const fixture = `${root}/tests/e2e/fixtures/sample.jpg`;
	const spec = `${root}/tests/benchmarks/.phase22-harness/jpeg_batch.spec.ts`;
	const config = `${root}/tests/benchmarks/.phase22-harness/phase22.playwright.config.mjs`;
	const cli = `${root}/node_modules/@playwright/test/cli.js`;
	return { worktreeRoot: root, node: { argv0: process.execPath, executable: process.execPath, sha256: "node", version: process.version }, playwright: { cliPath: cli, sha256: "playwright", version: "1.62.0" }, argv: [cli, "test", spec, "--config", config, "--workers=1", "--retries=0", "--repeat-each=1", "--reporter=line"], cwd: root, environment: { BENCHMARK_FIXTURE: fixture, BENCHMARK_REVISION: values.revision, BENCHMARK_KIND: values.kind, BENCHMARK_TRIAL: values.trial, BENCHMARK_SAMPLE_OUT: values.sampleOut, CI: "1", NODE_ENV: "development" }, config: { path: config, content: "phase22", sha256: "config" }, fixture: { path: fixture, sha256: "fixture", size: 1, files: [{ path: `${root}/tmp/000.jpg`, sha256: "fixture" }, { path: `${root}/tmp/001.jpg`, sha256: "fixture" }] }, timer: { start: "immediately-before-submission", stop: "200-terminal-rows", target: 200, excluded: ["build", "launch", "fixture-creation", "cleanup"], timeoutMs: 120000 } };
}
export function validateEvidence(evidence) {
	if (!evidence?.harness?.sha256 || !evidence?.fixture?.sha256) throw new Error("Missing harness or fixture identity");
	for (const pair of evidence.pairs ?? []) assertEquivalentPair(pair.baseline.rawInvocation, pair.candidate.rawInvocation);
	const baseline = evidence.samples?.baseline?.measured ?? [];
	const candidate = evidence.samples?.candidate?.measured ?? [];
	if (baseline.length !== 9 || candidate.length !== 9) throw new Error("Expected exactly nine measured samples per revision");
	const verdict = computeVerdict(baseline.map((sample) => sample.durationMs), candidate.map((sample) => sample.durationMs));
	if (!verdict.pass) throw new Error("Candidate exceeds the predeclared median-plus-two-MAD bound");
	return verdict;
}
export function runProtectedFieldMutationProbes() {
	const baseline = makeSyntheticInvocation("/tmp/baseline", { revision: "baseline", kind: "measured", trial: "1", sampleOut: "/tmp/baseline/out.json" });
	const candidate = makeSyntheticInvocation("/tmp/candidate", { revision: "candidate", kind: "measured", trial: "1", sampleOut: "/tmp/candidate/out.json" });
	for (const mutate of [(x) => { x.argv[5] = "--workers=2"; }, (x) => { x.config.sha256 = "changed"; }, (x) => { x.node.version = "changed"; }, (x) => { x.playwright.sha256 = "changed"; }, (x) => { x.environment.CI = "0"; }, (x) => { x.fixture.files.reverse(); }, (x) => { x.timer.target = 199; }]) {
		const changed = structuredClone(candidate); mutate(changed); let rejected = false; try { assertEquivalentPair(baseline, changed); } catch { rejected = true; } if (!rejected) throw new Error("Protected-field mutation was accepted");
	}
}
function selfTest() {
	const a = makeSyntheticInvocation("/tmp/a", { revision: "a", kind: "measured", trial: "1", sampleOut: "/tmp/a/out.json" });
	const b = makeSyntheticInvocation("/tmp/b", { revision: "b", kind: "measured", trial: "1", sampleOut: "/tmp/b/out.json" });
	assertEquivalentPair(a, b);
	runProtectedFieldMutationProbes();
	if (!computeVerdict([10, 11, 12], [11, 12, 13]).pass) throw new Error("Formula self-test failed");
	console.log("Phase 22 validator self-test passed");
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
	if (process.argv.includes("--self-test")) selfTest();
	else { const input = process.argv[2]; if (!input) throw new Error("Usage: node scripts/validate_phase22_benchmark.mjs <evidence.json>"); console.log(JSON.stringify(validateEvidence(JSON.parse(fs.readFileSync(input, "utf8"))), null, 2)); }
}
