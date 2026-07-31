import { describe, expect, test } from "vitest";

describe("Phase 22 benchmark protocol", () => {
	test("qualifies an idle AC-powered Mac without thermal pressure", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const collector = await import("../../scripts/run_phase22_benchmark.mjs");
		const verdict = collector.evaluateHostProbe({
			platform: "darwin",
			power: "Now drawing from 'AC Power'\n -InternalBattery-0\t100%; charged;",
			hid: '    | |   "HIDIdleTime" = 90000000000',
			load: "{ 3.05 4.06 4.42 }",
			logicalCpu: "18",
			thermal:
				"Note: No thermal warning level has been recorded\n" +
				"Note: No performance warning level has been recorded",
		});

		expect(verdict).toMatchObject({
			eligible: true,
			acPower: true,
			hidIdleSeconds: 90,
			normalizedLoad: 3.05 / 18,
			thermalClear: true,
		});
		expect(verdict.reasons).toEqual([]);
	});

	test("waits through transient activity and requires a fresh stable window", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const collector = await import("../../scripts/run_phase22_benchmark.mjs");
		const sequence = [true, true, false, true, true, true];
		let index = 0;
		let clock = 0;
		const result = await collector.waitForControlledHost({
			probe: () => {
				const eligible = sequence[index++] ?? true;
				return { eligible, reasons: eligible ? [] : ["excessive-system-load"] };
			},
			sleep: async (milliseconds: number) => {
				clock += milliseconds;
			},
			now: () => clock,
			requirements: {
				stableSamples: 3,
				sampleIntervalMs: 10,
				waitTimeoutMs: 100,
			},
		});

		expect(
			result.samples.map((sample: { eligible: boolean }) => sample.eligible),
		).toEqual(sequence);
		expect(result.stableSamples).toBe(3);
	});

	test("collects controlled-host evidence from macOS system probes", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const collector = await import("../../scripts/run_phase22_benchmark.mjs");
		const outputs = new Map([
			["pmset -g batt", "Now drawing from 'AC Power'"],
			["ioreg -r -c IOHIDSystem -d 1", '"HIDIdleTime" = 70000000000'],
			["sysctl -n vm.loadavg", "{ 1.0 1.0 1.0 }"],
			["sysctl -n hw.logicalcpu", "10"],
			[
				"pmset -g therm",
				"No thermal warning level has been recorded\nNo performance warning level has been recorded",
			],
		]);
		const verdict = collector.probeControlledHost({
			platform: "darwin",
			exec: (command: string, args: string[]) =>
				outputs.get([command, ...args].join(" ")),
		});

		expect(verdict.eligible).toBe(true);
		expect(verdict.raw.platform).toBe("darwin");
		expect(verdict.raw.power).toContain("AC Power");
	});

	test("defaults measured collection to autonomous host waiting and rejects manual confirmation", async () => {
		// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
		const collector = await import("../../scripts/run_phase22_benchmark.mjs");
		expect(collector.parseArgs([])).toMatchObject({
			hostWaitTimeoutMs: 900_000,
		});
		expect(collector.parseArgs([])).not.toHaveProperty("confirm");
		expect(() => collector.parseArgs(["--confirm-controlled-host"])).toThrow(
			/Unknown argument/,
		);
	});

	test("normalizes only the detached root and four declared sample values", async () => {
		const protocol =
			// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
			await import("../../scripts/validate_phase22_benchmark.mjs");
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
		const protocol =
			// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
			await import("../../scripts/validate_phase22_benchmark.mjs");
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
		const protocol =
			// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
			await import("../../scripts/validate_phase22_benchmark.mjs");
		const verdict = protocol.computeVerdict([10, 11, 12], [11, 12, 13]);
		expect(verdict.baselineMedian).toBe(11);
		expect(verdict.candidateMedian).toBe(12);
		expect(verdict.pass).toBe(true);
	});

	test("rejects timing evidence without automated host qualification", async () => {
		const protocol =
			// @ts-expect-error benchmark CLI is intentionally dependency-free JavaScript.
			await import("../../scripts/validate_phase22_benchmark.mjs");
		const measured = Array.from({ length: 9 }, (_, index) => ({
			durationMs: 100 + index,
		}));
		expect(() =>
			protocol.validateEvidence({
				harness: { sha256: "harness" },
				fixture: { sha256: "fixture" },
				pairs: [],
				samples: {
					baseline: { measured },
					candidate: { measured },
				},
			}),
		).toThrow(/host qualification/i);
	});
});
