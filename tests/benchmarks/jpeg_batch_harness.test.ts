import { describe, expect, test } from "vitest";

describe("Phase 22 benchmark protocol", () => {
	test("normalizes only the detached root and four declared sample values", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const protocol = await import("../../scripts/validate_phase22_benchmark.mjs");
		const baseline = protocol.makeSyntheticInvocation("/tmp/baseline", {
			revision: "baseline-sha",
			kind: "warmup",
			trial: "1",
			sampleOut: "/tmp/baseline/sample.json",
		});
		const candidate = protocol.makeSyntheticInvocation("/tmp/candidate", {
			revision: "candidate-sha",
			kind: "warmup",
			trial: "1",
			sampleOut: "/tmp/candidate/sample.json",
		});

		expect(protocol.canonicalJson(protocol.normalizeInvocation(baseline))).toBe(
			protocol.canonicalJson(protocol.normalizeInvocation(candidate)),
		);
	});

	test("rejects protected invocation mutations", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const protocol = await import("../../scripts/validate_phase22_benchmark.mjs");
		const baseline = protocol.makeSyntheticInvocation("/tmp/baseline", {
			revision: "baseline-sha",
			kind: "measured",
			trial: "1",
			sampleOut: "/tmp/baseline/sample.json",
		});
		const candidate = structuredClone(baseline);
		candidate.argv[candidate.argv.length - 1] = "--reporter=json";
		expect(() => protocol.assertEquivalentPair(baseline, candidate)).toThrow(
			/normalized invocation mismatch/,
		);
	});

	test("uses the locked median plus two MAD formula", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const protocol = await import("../../scripts/validate_phase22_benchmark.mjs");
		const verdict = protocol.computeVerdict([10, 11, 12], [11, 12, 13]);
		expect(verdict.baselineMedian).toBe(11);
		expect(verdict.candidateMedian).toBe(12);
		expect(verdict.pass).toBe(true);
	});
});
