import type { MetadataError } from "exifcleaner-node";
import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import {
	mintFallbackGrant,
	redeemFallbackGrant,
} from "../../src/infrastructure/metadata/native_fallback_authority";
import type { NativeMetadataError } from "../../src/infrastructure/metadata/native_metadata_port";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeMetadata } from "../fakes/fake_native_metadata";

function buildLibraryError({
	phase,
	nativeWrite,
}: {
	phase: MetadataError["phase"];
	nativeWrite: MetadataError["nativeWrite"];
}): MetadataError {
	return { code: "aborted", detail: "test failure", phase, nativeWrite };
}

function nativeErrorFixture({
	phase,
	nativeWrite,
	nativeCode = "aborted",
}: {
	phase: MetadataError["phase"];
	nativeWrite: MetadataError["nativeWrite"];
	nativeCode?: NativeMetadataError["nativeCode"];
}): NativeMetadataError {
	const libraryError = buildLibraryError({ phase, nativeWrite });
	return {
		code: "native-error",
		nativeCode,
		detail: "native failure",
		backend: "native",
		phase,
		nativeWrite,
		libraryError,
	};
}

// This is the end-to-end proof of the single capability-driven admission path
// (D-13, D-15, D-20): a save-as-copy request whose source is eligible by
// registered capability alone reaches the native port exactly once, an
// overwrite request never reaches it regardless of destination shape, and
// content — not the source filename — decides eligibility.
describe("native metadata routing tracer", () => {
	it("routes an eligible save-as-copy request to native by capability alone", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize({
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: true,
		});

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toHaveLength(1);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toHaveLength(0);
	});

	it("never routes an overwrite request to native, even with a defined destination distinct from the source", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		// The D-20 stage-path case: overwrite requests can still carry a defined
		// destination that resolves differently from the source (e.g. a RAW/media
		// stage path). A defined, distinct destination must not be mistaken for a
		// copy request.
		const result = await engine.sanitize({
			source: "/files/source.webp",
			destination: "/files/.exifcleaner-stage-source.webp",
			outputMode: "overwrite",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: true,
		});

		expect(native.sanitizeCalls).toHaveLength(0);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toHaveLength(1);
		expect(result).toBe(exiftool.sanitizeResult);
	});

	it("routes an eligible source to native even when its extension is not .webp", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });

		// Content decides the reader; the name decides the written filename
		// (the libvips rule, D-17). A source with WebP bytes under any extension
		// is eligible — the capability table has no extension notion.
		const result = await engine.sanitize({
			source: "/files/source.bin",
			destination: "/files/clean.bin",
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: true,
		});

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toHaveLength(1);
	});

	it("mints and redeems a grant for a proven pre-write safe decline, authorizing exactly one ExifTool sanitize call", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		native.sanitizeResult = {
			ok: false,
			error: nativeErrorFixture({
				phase: "admission",
				nativeWrite: "not-started",
			}),
		};
		const engine = new HybridMetadataEngine({ exiftool, native });

		const result = await engine.sanitize({
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: true,
		});

		expect(result).toBe(exiftool.sanitizeResult);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toHaveLength(1);
	});

	it("returns false and adds no call when the same grant is redeemed a second time", () => {
		const error = buildLibraryError({
			phase: "admission",
			nativeWrite: "not-started",
		});
		const grant = mintFallbackGrant(error);

		expect(grant).toBeDefined();
		if (grant === undefined) return;
		expect(redeemFallbackGrant(grant)).toBe(true);
		expect(redeemFallbackGrant(grant)).toBe(false);
	});

	// "malformed-file" deliberately excluded from this sweep: that exact
	// tuple (phase: transaction, nativeWrite: started, code: malformed-file)
	// is 47-03's dedicated NC-1 fixture in native_fallback_authority.test.ts,
	// which scripts/nc1_mutation_gate.mjs's mutation targets specifically so
	// restoring the deleted error-code switch makes EXACTLY that one test
	// fail. Keeping "malformed-file" here too would make this test fail
	// alongside it, widening the mutation's observed blast radius past the
	// single title the gate requires.
	it.each(["aborted", "not-found", "write-failed"] as const)(
		"authorizes zero substitute writers for a post-write %s error, regardless of its error code",
		async (nativeCode) => {
			const exiftool = new FakeMetadataEngine();
			const native = new FakeNativeMetadata();
			native.sanitizeResult = {
				ok: false,
				error: nativeErrorFixture({
					phase: "transaction",
					nativeWrite: "started",
					nativeCode,
				}),
			};
			const engine = new HybridMetadataEngine({ exiftool, native });

			const result = await engine.sanitize({
				source: "/files/source.webp",
				destination: "/files/clean.webp",
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: false,
				preserveTimestamps: true,
			});

			expect(result).toBe(native.sanitizeResult);
			expect(exiftool.calls).toEqual([]);
		},
	);

	it("gives two independent admission-shaped failures each their own grant, both falling back", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = {
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			outputMode: "copy" as const,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: true,
		};

		native.sanitizeResult = {
			ok: false,
			error: nativeErrorFixture({
				phase: "admission",
				nativeWrite: "not-started",
			}),
		};
		const first = await engine.sanitize(request);

		native.sanitizeResult = {
			ok: false,
			error: nativeErrorFixture({
				phase: "admission",
				nativeWrite: "not-started",
			}),
		};
		const second = await engine.sanitize(request);

		expect(first).toBe(exiftool.sanitizeResult);
		expect(second).toBe(exiftool.sanitizeResult);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toHaveLength(2);
	});

	it("exposes phase and nativeWrite as declared, type-visible fields on the mapped native error, with no cast required", () => {
		const error = nativeErrorFixture({
			phase: "admission",
			nativeWrite: "not-started",
		});

		expect(error.phase).toBe("admission");
		expect(error.nativeWrite).toBe("not-started");
	});
});
