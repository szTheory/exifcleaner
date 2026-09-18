// P48-NC-1..3: negative controls for classifyInspectionDiagnostics's severity policy.
// Each control names the exact mutation that must make it fail -- a control nobody has
// watched fail is a comment with a green checkmark next to it (48-CONTEXT.md D-11).
//
// P48-NC-4 is deliberately NOT here: it must run through ReadMetadataQuery against a real
// ExifToolAdapter over the bundled binary and the committed issue344_cooccurrence.jpg
// fixture, not a hand-built object literal, because a hand-built object cannot prove what
// ExifTool's own JSON serialization does under co-occurrence (RESEARCH.md § D-06
// Resolution). See tests/e2e/fixtures/issue344_fixture.test.ts.
//
// Named mutations:
//   P48-NC-1: relax the policy to "any Warning is non-fatal"
//   P48-NC-2: pass the lenient (display) policy at the output-verification call site
//   P48-NC-3: apply the [minor] prefix rule to Error as well as Warning
//   P48-NC-4: revert D-05's full scan back to a first-match predicate (.find)

import { describe, it, expect } from "vitest";
import { classifyInspectionDiagnostics } from "../../src/infrastructure/exiftool/exiftool_diagnostics";

describe("classifyInspectionDiagnostics", () => {
	it("P48-NC-1: a non-minor warning stays fatal on display", () => {
		const record = {
			"ExifTool:Warning": "Bad offset for IFD1 Make",
		};

		const verdict = classifyInspectionDiagnostics({
			record,
			purpose: "display",
		});

		expect(verdict.fatal).toBe(true);
		if (verdict.fatal) {
			expect(verdict.detail).toBe("Bad offset for IFD1 Make");
		}
	});

	it("P48-NC-2: the same minor-prefixed record is fatal under output-verification", () => {
		const record = {
			"ExifTool:Warning":
				"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto",
		};

		const verdict = classifyInspectionDiagnostics({
			record,
			purpose: "output-verification",
		});

		expect(verdict.fatal).toBe(true);
		if (verdict.fatal) {
			expect(verdict.detail).toBe(
				"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto",
			);
		}
	});

	it("P48-NC-3: an ExifTool-group Error is fatal in both modes regardless of its value prefix", () => {
		// The Error value literally begins with the minor marker -- proving the prefix rule
		// from D-04 is never applied to Error, only Warning.
		const record = {
			"ExifTool:Error": "[minor] File format error",
		};

		const displayVerdict = classifyInspectionDiagnostics({
			record,
			purpose: "display",
		});
		const verificationVerdict = classifyInspectionDiagnostics({
			record,
			purpose: "output-verification",
		});

		expect(displayVerdict.fatal).toBe(true);
		if (displayVerdict.fatal) {
			expect(displayVerdict.detail).toBe("[minor] File format error");
		}
		expect(verificationVerdict.fatal).toBe(true);
		if (verificationVerdict.fatal) {
			expect(verificationVerdict.detail).toBe("[minor] File format error");
		}
	});
});
