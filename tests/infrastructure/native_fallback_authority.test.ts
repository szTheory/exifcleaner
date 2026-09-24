import type { MetadataError } from "exifcleaner-node";
import { classifyFallback } from "exifcleaner-node";
import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import {
	mintFallbackGrant,
	redeemFallbackGrant,
} from "../../src/infrastructure/metadata/native_fallback_authority";
import type { NativeMetadataError } from "../../src/infrastructure/metadata/native_metadata_port";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeMetadata } from "../fakes/fake_native_metadata";

// D-27's fallback-authority controls (NC-1, NC-3, NC-4). Every fixture below
// is a shape the real library can emit (PreCreate/PostCreateMetadataErrorDetails
// intersected with FallbackProof) — never a code-only stand-in (D-26).

const sanitizeRequest = {
	source: "/files/source.webp",
	destination: "/files/clean.webp",
	outputMode: "copy" as const,
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: false,
	preserveTimestamps: true,
};

function toNativeError(libraryError: MetadataError): NativeMetadataError {
	const path = "path" in libraryError ? libraryError.path : undefined;
	return {
		code: "native-error",
		nativeCode: libraryError.code,
		detail: libraryError.detail,
		backend: "native",
		phase: libraryError.phase,
		nativeWrite: libraryError.nativeWrite,
		libraryError,
		...(path === undefined ? {} : { path }),
	};
}

describe("native fallback authority", () => {
	// NC-1 (D-27): a post-write malformed-file error authorizes ZERO substitute
	// writers. The assertion is keyed on write state (phase: "transaction",
	// nativeWrite: "started"), never on error code — "malformed-file" is a code
	// the pre-D-05 switch treated as always-fallback-eligible, which is exactly
	// why this fixture is the one the mutation gate (scripts/nc1_mutation_gate.mjs)
	// restores that switch against: reintroducing a code-keyed branch makes
	// this exact test fail, because the code here is drawn from the old
	// fallback-eligible set but the write state says a native writer already
	// started.
	it("NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const libraryError: MetadataError = {
			code: "malformed-file",
			detail: "corrupt RIFF chunk discovered after the native write began",
			path: sanitizeRequest.source,
			phase: "transaction",
			nativeWrite: "started",
		};
		native.sanitizeResult = { ok: false, error: toNativeError(libraryError) };
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toEqual(native.sanitizeResult);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});

	// NC-3 (D-27): the full cross-product of (code x phase x nativeWrite),
	// enumerated from the INSTALLED library's own type declarations (not a
	// planning document), with the expected disposition obtained by CALLING
	// the real classifyFallback on the exact fixture under test — never a
	// restated table.
	//
	// This exercises mintFallbackGrant directly rather than driving the full
	// HybridMetadataEngine: mintFallbackGrant is the sole authority the engine
	// consults (hybrid_metadata_engine.ts calls it and nothing else to decide
	// whether to fall back), so a grant-level proof over the entire space is
	// exactly as strong a proof of the engine's fallback behavior as an
	// engine-level sweep would be — while staying decoupled from
	// hybrid_metadata_engine.ts's own source text, which is the one file
	// scripts/nc1_mutation_gate.mjs mutates. NC-1 above is the dedicated
	// engine-level demonstration that a mutation to that file's routing can be
	// shown to fail; NC-3's job is proving the authority module agrees with
	// the classifier everywhere, not re-demonstrating the engine wiring.
	// Enumerated from the installed library's own MetadataError shape via
	// indexed-access types — MetadataErrorPhase/NativeWriteState are not
	// themselves re-exported by exifcleaner-node's package root (only the
	// full MetadataError union is), matching the same constraint 47-02 hit
	// declaring exif_errors.ts's phase/nativeWrite fields.
	const PHASES: readonly MetadataError["phase"][] = [
		"request",
		"source-open",
		"admission",
		"transaction",
	];
	const WRITE_STATES: readonly MetadataError["nativeWrite"][] = [
		"not-started",
		"started",
	];
	const CODES = [
		"aborted",
		"invalid-options",
		"not-found",
		"unsupported-format",
		"malformed-file",
		"unsafe-structure",
		"unsupported-feature",
		"source-changed",
		"destination-exists",
		"destination-changed",
		"read-failed",
		"write-failed",
		"verification-failed",
		"cleanup-failed",
	] as const;

	it.each(
		CODES.flatMap((code) =>
			PHASES.flatMap((phase) =>
				WRITE_STATES.map((nativeWrite) => ({ code, phase, nativeWrite })),
			),
		),
	)(
		"NC-3: code=$code phase=$phase nativeWrite=$nativeWrite matches the real classifyFallback disposition",
		({ code, phase, nativeWrite }) => {
			// Every generated tuple is a real, library-emittable shape: `detail`
			// and `path` are the only fields PreCreate/PostCreateMetadataErrorDetails
			// require beyond `code`, and every listed code accepts both.
			const fixture = {
				code,
				detail: "cross-product fixture",
				path: sanitizeRequest.source,
				phase,
				nativeWrite,
			} as MetadataError;

			const expectedDisposition = classifyFallback(fixture);
			const grant = mintFallbackGrant(fixture);

			expect(grant !== undefined).toBe(
				expectedDisposition === "safe-to-fallback",
			);
		},
	);

	// NC-4 (D-27): double-redeem returns false and adds no call; two
	// independent failures each receive their own grant and both fall back.
	it("NC-4: redeeming the same grant twice returns false on the second redemption and adds no call", () => {
		const libraryError: MetadataError = {
			code: "aborted",
			detail: "user cancelled before any write began",
			path: sanitizeRequest.source,
			phase: "admission",
			nativeWrite: "not-started",
		};
		const grant = mintFallbackGrant(libraryError);
		expect(grant).not.toBeUndefined();
		if (grant === undefined) return;

		expect(redeemFallbackGrant(grant)).toBe(true);
		expect(redeemFallbackGrant(grant)).toBe(false);
	});

	it("NC-4: two independent failures each receive their own grant, both falling back", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const firstError: MetadataError = {
			code: "aborted",
			detail: "first independent admission-shaped decline",
			path: sanitizeRequest.source,
			phase: "admission",
			nativeWrite: "not-started",
		};
		const secondError: MetadataError = {
			code: "invalid-options",
			detail: "second independent admission-shaped decline",
			path: sanitizeRequest.source,
			phase: "admission",
			nativeWrite: "not-started",
		};
		const engine = new HybridMetadataEngine({ exiftool, native });

		native.sanitizeResult = { ok: false, error: toNativeError(firstError) };
		const first = await engine.sanitize(sanitizeRequest);
		native.sanitizeResult = { ok: false, error: toNativeError(secondError) };
		const second = await engine.sanitize(sanitizeRequest);

		expect(first).toBe(exiftool.sanitizeResult);
		expect(second).toBe(exiftool.sanitizeResult);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toHaveLength(2);
	});
});
