import { describe, expect, test } from "vitest";
import {
	applyNc1Mutation,
	evaluateMutationVerdict,
} from "../../scripts/nc1_mutation_gate.mjs";

const SOURCE = `
	async sanitize(
		request: Parameters<MetadataEnginePort["sanitize"]>[0],
	): Promise<Result<void, MetadataEngineError>> {
		if (!this.isNativeCopyCandidate(request)) {
			return this.exiftool.sanitize(request);
		}

		const nativeRequest: NativeSanitizeRequest = request;
		const native = await this.native.sanitize(nativeRequest);
		if (native.ok) return native;

		// Authority comes solely from the library's own proven pre-write safe
		// decline (native_fallback_authority.ts), never a restated table here.
		const grant = mintFallbackGrant(native.error.libraryError);
		if (grant === undefined || !redeemFallbackGrant(grant)) {
			return native;
		}
		return this.exiftool.sanitize(request);
	}
`;

const NC1_TITLE =
	"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code";
// 47-05: NC-9b independently scans the same mutated file and legitimately also fails.
const NC9B_TITLE =
	"NC-9b: hybrid_metadata_engine.ts contains zero occurrences of the nativeCode identifier";

describe("applyNc1Mutation", () => {
	test("reintroduces a code-keyed fallback switch ahead of the grant-based check", () => {
		const mutated = applyNc1Mutation(SOURCE);

		expect(mutated).toContain("switch (native.error.nativeCode)");
		expect(mutated).toContain('case "malformed-file":');
		expect(mutated).toContain(
			"const grant = mintFallbackGrant(native.error.libraryError);",
		);
		// The original seam must still be present, immediately after the
		// reintroduced switch — this is an addition ahead of the seam, not a
		// replacement of it.
		const seamIndex = mutated.indexOf(
			"const grant = mintFallbackGrant(native.error.libraryError);",
		);
		const switchIndex = mutated.indexOf("switch (native.error.nativeCode)");
		expect(switchIndex).toBeGreaterThanOrEqual(0);
		expect(switchIndex).toBeLessThan(seamIndex);
	});

	test("refuses a missing or ambiguous seam", () => {
		expect(() => applyNc1Mutation("const x = 1;")).toThrow(
			"exactly one fallback-authority seam",
		);
		expect(() => applyNc1Mutation(`${SOURCE}\n${SOURCE}`)).toThrow(
			"exactly one fallback-authority seam",
		);
	});
});

describe("evaluateMutationVerdict", () => {
	test("passes when baseline is green and the mutated run fails with exactly the NC-1 title", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: false, failingTitles: [NC1_TITLE] },
			expectedFailingTitles: [NC1_TITLE],
		});

		expect(verdict.ok).toBe(true);
	});

	// 47-05: the real gate now expects TWO titles (NC-1 and NC-9b, which independently scans
	// the same mutated file). Order in the actual failing-titles array must not matter.
	test("passes when the mutated run fails with exactly the NC-1 and NC-9b titles, in either order", () => {
		const verdictInOrder = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: false, failingTitles: [NC1_TITLE, NC9B_TITLE] },
			expectedFailingTitles: [NC1_TITLE, NC9B_TITLE],
		});
		const verdictReversed = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: false, failingTitles: [NC9B_TITLE, NC1_TITLE] },
			expectedFailingTitles: [NC1_TITLE, NC9B_TITLE],
		});

		expect(verdictInOrder.ok).toBe(true);
		expect(verdictReversed.ok).toBe(true);
	});

	// Negative control 1: the mutated run was fully green — this is exactly the
	// Phase 46 defect class (a check that can never fire) and must be reported
	// as a FAILING verdict, not silently accepted.
	test("fails when the mutated run was fully green (the check cannot fire)", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: true, failingTitles: [] },
			expectedFailingTitles: [NC1_TITLE],
		});

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/fully green/);
	});

	// Negative control 2: more than the expected titles failed — the mutation's blast radius
	// exceeded expectations, which is a finding about the control's precision, not something
	// this verdict function may wave through.
	test("fails when more titles failed than expected", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: {
				success: false,
				failingTitles: [NC1_TITLE, NC9B_TITLE, "some unrelated test"],
			},
			expectedFailingTitles: [NC1_TITLE, NC9B_TITLE],
		});

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/not exactly/);
	});

	// Negative control 3: only ONE of the two expected titles failed — a regression where one
	// of the two independent gates stopped firing must also be caught, not waved through.
	test("fails when only one of two expected titles failed", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: false, failingTitles: [NC1_TITLE] },
			expectedFailingTitles: [NC1_TITLE, NC9B_TITLE],
		});

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/not exactly/);
	});

	test("fails when the baseline (unmutated) run was not fully green", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: false, failingTitles: ["some other test"] },
			mutated: { success: false, failingTitles: [NC1_TITLE] },
			expectedFailingTitles: [NC1_TITLE],
		});

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/baseline/);
	});

	test("fails when the wrong single test failed", () => {
		const verdict = evaluateMutationVerdict({
			baseline: { success: true, failingTitles: [] },
			mutated: { success: false, failingTitles: ["an unrelated test"] },
			expectedFailingTitles: [NC1_TITLE],
		});

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/not exactly/);
	});
});
