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
	// phase/nativeWrite. Fallback authority in native_fallback_authority.test
	// coverage (see native_metadata_routing_tracer.test.ts) exercises the full
	// admission-vs-post-write matrix; this file keeps only routing-predicate
	// coverage.
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

	it.each([
		"unsupported-format",
		"malformed-file",
		"unsafe-structure",
		"unsupported-feature",
	] as const)(
		"falls back to ExifTool exactly once after a proven admission-shaped decline reported as %s",
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
});
