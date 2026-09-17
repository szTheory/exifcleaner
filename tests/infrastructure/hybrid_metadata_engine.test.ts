import type { MetadataError } from "exifcleaner-node";
import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import type { NativeMetadataError } from "../../src/infrastructure/metadata/native_metadata_port";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeMetadata } from "../fakes/fake_native_metadata";

describe("HybridMetadataEngine", () => {
	const sanitizeRequest = {
		source: "/files/source.webp",
		destination: "/files/clean.webp",
		outputMode: "copy" as const,
		preserveOrientation: true,
		preserveColorProfile: true,
		preserveTimestamps: true,
	};

	// D-26: every fixture error must be a shape the real library can actually
	// emit (Details & FallbackProof) — never a code-only stand-in with no
	// phase/nativeWrite. Fallback authority's own cross-product (NC-3) and the
	// post-write demonstration (NC-1) live in
	// tests/infrastructure/native_fallback_authority.test.ts; this file keeps
	// only routing-predicate coverage (admission/capability/outputMode).
	function nativeError({
		phase,
		nativeWrite,
		nativeCode = "aborted",
	}: {
		phase: MetadataError["phase"];
		nativeWrite: MetadataError["nativeWrite"];
		nativeCode?: NativeMetadataError["nativeCode"];
	}): NativeMetadataError {
		const libraryError: MetadataError = {
			code: "aborted",
			detail: "native failure",
			path: sanitizeRequest.source,
			phase,
			nativeWrite,
		};
		return {
			code: "native-error",
			nativeCode,
			detail: "native failure",
			path: sanitizeRequest.source,
			backend: "native",
			phase,
			nativeWrite,
			libraryError,
		};
	}

	it("keeps both inspection purposes on ExifTool", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		for (const purpose of ["display", "output-verification"] as const) {
			await engine.inspect({ source: "/files/photo.webp", purpose });
		}

		expect(exiftool.calls).toEqual([
			{
				method: "inspect",
				request: { source: "/files/photo.webp", purpose: "display" },
			},
			{
				method: "inspect",
				request: {
					source: "/files/photo.webp",
					purpose: "output-verification",
				},
			},
		]);
		expect(native.sanitizeCalls).toEqual([]);
	});

	it("routes an admitted WebP save-as-copy request to native once", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const controller = new AbortController();
		const request = {
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			outputMode: "copy" as const,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			signal: controller.signal,
		};

		const result = await engine.sanitize(request);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toEqual([request]);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});

	// NC-7 copy row (D-27): an eligible copy is routed natively exactly once.
	// Distinct from the general routing test above so 47-05 can pin this exact
	// title as the NC-7 "copy row" evidence alongside the whole-directory
	// overwrite-row assertion in tests/integration/native_metadata_oracle.test.ts.
	it("NC-7: an eligible copy request asserts native call count 1", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toHaveLength(1);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});

	it.each([
		"unsupported-format",
		"malformed-file",
		"unsafe-structure",
		"unsupported-feature",
	] as const)(
		"NC-2: a proven admission-shaped decline reported as %s falls back to ExifTool exactly once",
		async (nativeCode) => {
			const exiftool = new FakeMetadataEngine();
			const native = new FakeNativeMetadata();
			native.sanitizeResult = {
				ok: false,
				error: nativeError({
					phase: "admission",
					nativeWrite: "not-started",
					nativeCode,
				}),
			};
			const engine = new HybridMetadataEngine({ exiftool, native });
			const controller = new AbortController();
			const request = { ...sanitizeRequest, signal: controller.signal };

			const result = await engine.sanitize(request);

			expect(result).toBe(exiftool.sanitizeResult);
			expect(native.sanitizeCalls).toEqual([request]);
			expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
		},
	);

	it.each([
		"aborted",
		"invalid-options",
		"not-found",
		"read-failed",
		"destination-exists",
		"destination-changed",
		"source-changed",
		"write-failed",
		"verification-failed",
		"cleanup-failed",
	] as const)(
		"never retries once native write has started, regardless of error code (%s)",
		async (nativeCode) => {
			const exiftool = new FakeMetadataEngine();
			const native = new FakeNativeMetadata();
			const error = nativeError({
				phase: "transaction",
				nativeWrite: "started",
				nativeCode,
			});
			native.sanitizeResult = { ok: false, error };
			const engine = new HybridMetadataEngine({ exiftool, native });

			const result = await engine.sanitize(sanitizeRequest);

			expect(result).toBe(native.sanitizeResult);
			expect(native.sanitizeCalls).toEqual([sanitizeRequest]);
			expect(exiftool.calls).toEqual([]);
		},
	);

	// NC-5 (D-27): destination-exists and aborted requests each produce zero
	// fallbacks. Pulled out as their own dedicated titles (distinct from the
	// broader "never retries" sweep above, which covers the same two codes
	// among ten) so 47-05 has a stable, unambiguous NC-5 title to pin.
	it("NC-5: a destination-exists decline produces zero fallbacks", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const error = nativeError({
			phase: "transaction",
			nativeWrite: "started",
			nativeCode: "destination-exists",
		});
		native.sanitizeResult = { ok: false, error };
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toBe(native.sanitizeResult);
		expect(exiftool.calls).toEqual([]);
	});

	it("NC-5: an aborted request produces zero fallbacks", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const error = nativeError({
			phase: "transaction",
			nativeWrite: "started",
			nativeCode: "aborted",
		});
		native.sanitizeResult = { ok: false, error };
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toBe(native.sanitizeResult);
		expect(exiftool.calls).toEqual([]);
	});

	it.each([
		["missing destination", { ...sanitizeRequest, destination: undefined }],
		[
			"same resolved path",
			{
				...sanitizeRequest,
				destination: "/files/other/../source.webp",
			},
		],
		[
			"overwrite output mode",
			{ ...sanitizeRequest, outputMode: "overwrite" as const },
		],
	] as const)("uses ExifTool directly for %s", async (_reason, request) => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(request);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
	});

	it("uses ExifTool directly when a requested preservation capability is absent", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.capabilities = {
			formats: [
				{
					format: "webp",
					sanitize: true,
					detection: "magic",
					preserves: {
						orientation: false,
						colorProfile: true,
						timestamps: true,
					},
				},
			],
		};
		const engine = new HybridMetadataEngine({ exiftool, native });

		await engine.sanitize(sanitizeRequest);

		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([
			{ method: "sanitize", request: sanitizeRequest },
		]);
	});

	// NC-6 (D-27): zero-format and non-"magic"-detection capability tables
	// route zero native work, and (NC-6c, the assumption-delta generalization)
	// a NON-webp registered format satisfying sanitize+magic+preserves IS
	// routed natively — proving D-15's capability lookup is truly
	// format-agnostic, not silently re-keyed on the "webp" literal.
	it("NC-6a: a capability table with zero formats routes zero native work", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.capabilities = { formats: [] };
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([
			{ method: "sanitize", request: sanitizeRequest },
		]);
	});

	it("NC-6b: a capability table whose detection literal is not the magic literal routes zero native work", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.capabilities = {
			formats: [
				{
					format: "webp",
					sanitize: true,
					// Runtime defense-in-depth: D-16 closes the *type* to the
					// literal "magic", so this cast simulates a capability table
					// that has drifted at runtime (e.g. a mismatched library
					// version) rather than a shape the compiler would ever emit
					// on its own.
					detection: "not-magic" as unknown as "magic",
					preserves: {
						orientation: true,
						colorProfile: true,
						timestamps: true,
					},
				},
			],
		};
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([
			{ method: "sanitize", request: sanitizeRequest },
		]);
	});

	it("NC-6c: a capability table registering a non-webp format with sanitize and magic detection routes it natively", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.capabilities = {
			formats: [
				{
					// Deliberately NOT "webp" — this is the generalization control:
					// the capability lookup (hybrid_metadata_engine.ts) must select
					// by sanitize+detection+preserves alone (D-15), never by a
					// format === "webp" equality. Reintroducing that equality check
					// makes exactly this test go red.
					format: "avif",
					sanitize: true,
					detection: "magic",
					preserves: {
						orientation: true,
						colorProfile: true,
						timestamps: true,
					},
				},
			],
		};
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toHaveLength(1);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});

	// D-17 (both directions): content decides the reader, the name decides the
	// written filename. Electron reads zero bytes before routing (D-13), so
	// these two rows simulate the library's own content-vs-name outcome via
	// the fake's sanitizeResult/sanitizeCalls rather than real bytes — the
	// real-bytes proof lives in tests/integration/native_metadata_oracle.test.ts.
	it("D-17: a .webp-named source over non-webp bytes is declined by the library at admission and falls back exactly once", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.sanitizeResult = {
			ok: false,
			error: nativeError({
				phase: "admission",
				nativeWrite: "not-started",
				nativeCode: "unsupported-format",
			}),
		};
		const engine = new HybridMetadataEngine({ exiftool, native });
		// sanitizeRequest.source already carries a .webp extension; the library
		// (not Electron) is what discovers the content mismatch and declines.

		const result = await engine.sanitize(sanitizeRequest);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([sanitizeRequest]);
		expect(exiftool.calls).toEqual([
			{ method: "sanitize", request: sanitizeRequest },
		]);
	});

	it("D-17: webp bytes under a non-webp or absent extension are eligible for native routing regardless of filename", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = {
			...sanitizeRequest,
			source: "/files/source.bin",
			destination: "/files/clean.bin",
		};

		const result = await engine.sanitize(request);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toEqual([request]);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});
});
