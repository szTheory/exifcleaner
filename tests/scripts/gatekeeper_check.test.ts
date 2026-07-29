import { describe, expect, test } from "vitest";
import { classifySpctl } from "../../scripts/gatekeeper_check.mjs";

// Fixtures below marked MEASURED are verbatim `spctl -a -vv --type execute` output
// captured on macOS 26.5 (build 25F71) on 2026-07-28, against a real packmacdir build
// of this project and two deliberately corrupted copies of it.
//
// The rest are corruption strings this parser must treat as fatal on any macOS.
//
// This suite is the anti-rot mechanism for the Gatekeeper gate: the parser is the part
// most likely to drift, and these tests run on the Ubuntu job with no macOS required.

// MEASURED — healthy ad-hoc bundle. Note there is NO source= line. An earlier version
// of this parser required one and therefore failed closed on every healthy build.
const MEASURED_HEALTHY = `/tmp/gk-healthy.app: rejected`;

// MEASURED — unsigned nested helper (codesign --remove-signature on a Helper.app).
// Note `source=no usable signature` appears on a BROKEN bundle here, not a healthy one.
const MEASURED_UNSIGNED_HELPER = `/tmp/gk-A.app: rejected
source=no usable signature`;

// MEASURED — broken outer seal (framework signature removed, outer re-signed w/o --deep).
const MEASURED_BROKEN_SEAL = `/tmp/gk-B.app: rejected
source=no usable signature`;

const DAMAGED = `/tmp/x.app: rejected (the code is damaged or has been modified)
source=No Usable Signature`;

const SEALED_RESOURCE = `/tmp/x.app: rejected
source=No Usable Signature
a sealed resource is missing or invalid`;

const OBSOLETE_ENVELOPE = `/tmp/x.app: rejected
source=No Usable Signature
resource envelope is obsolete (version 1 signature)`;

describe("classifySpctl", () => {
	test("accepts the measured healthy ad-hoc verdict, which has no source line", () => {
		// Regression lock for the bug this parser shipped with: requiring a source=
		// line rejected every healthy build on macOS 26.
		const result = classifySpctl(MEASURED_HEALTHY);

		expect(result.ok).toBe(true);
		expect(result.source).toBe("(none)");
	});

	test("does not fail a bundle merely for reporting no usable signature", () => {
		// On macOS 26 this string accompanies broken bundles, but on older macOS it is
		// documented as the healthy ad-hoc signal. Its meaning is version-dependent, so
		// this parser deliberately does not branch on it in either direction — codesign
		// (layer 1) is the authoritative discriminator and catches both break modes.
		expect(classifySpctl(MEASURED_UNSIGNED_HELPER).ok).toBe(true);
		expect(classifySpctl(MEASURED_BROKEN_SEAL).ok).toBe(true);
	});

	test("rejects the damaged verdict that is not user-bypassable", () => {
		const result = classifySpctl(DAMAGED);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("damaged");
	});

	test("rejects a missing sealed resource even when source= looks acceptable", () => {
		// Ordering lock: the fatal scan must run before anything reads source=, or this
		// output passes on the strength of its source= line alone.
		const result = classifySpctl(SEALED_RESOURCE);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("sealed resource");
	});

	test("rejects an obsolete resource envelope", () => {
		const result = classifySpctl(OBSOLETE_ENVELOPE);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("resource envelope is obsolete");
	});

	test("rejects unsigned code objects", () => {
		const result = classifySpctl("x.app: code object is not signed at all");

		expect(result.ok).toBe(false);
	});

	test("is case-insensitive on fatal markers", () => {
		const result = classifySpctl("/tmp/x.app: rejected (the code is DAMAGED)");

		expect(result.ok).toBe(false);
	});

	test("reports the source when one is present", () => {
		const result = classifySpctl(
			"/tmp/x.app: accepted\nsource=Unnotarized Developer ID",
		);

		expect(result.ok).toBe(true);
		expect(result.source).toBe("unnotarized developer id");
	});
});
