import { describe, expect, test } from "vitest";
// eslint-disable-next-line -- .mjs script, imported for its pure parser
import { classifySpctl } from "../../scripts/gatekeeper_check.mjs";

// These fixtures encode the exact distinction this milestone exists to enforce:
// an ad-hoc-signed app is EXPECTED to be "rejected" by spctl (that rejection is what
// the bypassable "unidentified developer" dialog looks like from the CLI), while a
// structurally broken bundle produces "damaged" or a sealed-resource complaint and is
// NOT user-bypassable.
//
// The parser is the part of the gate most likely to rot, so it is covered here as a
// pure function — these run on the Ubuntu job on every PR, with no macOS required.

const HEALTHY_ADHOC = `/tmp/ExifCleaner.app: rejected
source=No Usable Signature
origin=(null)`;

const HEALTHY_UNNOTARIZED = `/tmp/ExifCleaner.app: rejected
source=Unnotarized Developer ID
origin=Developer ID Application: Example`;

// The #290 state: pre-signed Electron frameworks left inside an otherwise-unsigned
// bundle. Not bypassable — the user's only option is Trash.
const DAMAGED = `/tmp/ExifCleaner.app: rejected (the code is damaged or has been modified)
source=No Usable Signature`;

// The case that motivates layer 2 existing at all: codesign can pass while the
// Gatekeeper assessment engine still rejects on the resource envelope.
const SEALED_RESOURCE = `/tmp/ExifCleaner.app: rejected
source=No Usable Signature
a sealed resource is missing or invalid`;

const OBSOLETE_ENVELOPE = `/tmp/ExifCleaner.app: rejected
source=No Usable Signature
resource envelope is obsolete (version 1 signature)`;

describe("classifySpctl", () => {
	test("accepts a healthy ad-hoc signature reporting no usable signature", () => {
		const result = classifySpctl(HEALTHY_ADHOC);

		expect(result.ok).toBe(true);
		expect(result.source).toBe("no usable signature");
	});

	test("accepts an unnotarized developer id verdict", () => {
		const result = classifySpctl(HEALTHY_UNNOTARIZED);

		expect(result.ok).toBe(true);
		expect(result.source).toBe("unnotarized developer id");
	});

	test("rejects the damaged verdict that is not user-bypassable", () => {
		const result = classifySpctl(DAMAGED);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("damaged");
	});

	test("rejects a missing sealed resource even when source= looks acceptable", () => {
		// Regression lock for the ordering bug: the fatal check must run BEFORE the
		// allow-list, or this output passes on the strength of its source= line alone.
		const result = classifySpctl(SEALED_RESOURCE);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("sealed resource");
	});

	test("rejects an obsolete resource envelope", () => {
		const result = classifySpctl(OBSOLETE_ENVELOPE);

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("resource envelope is obsolete");
	});

	test("fails closed on an unrecognized source", () => {
		// If Apple renames a verdict, a human should widen the allow-list deliberately
		// rather than have the gate silently accept anything it does not recognize.
		const result = classifySpctl("/tmp/x.app: rejected\nsource=Brand New Verdict");

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("unrecognized source");
	});

	test("fails closed when spctl output has no source line", () => {
		const result = classifySpctl("something completely unexpected");

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("no source=");
	});

	test("is case-insensitive on fatal markers", () => {
		const result = classifySpctl("/tmp/x.app: rejected (the code is DAMAGED)");

		expect(result.ok).toBe(false);
	});
});
