import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeMetadata } from "../fakes/fake_native_metadata";

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
			preserveTimestamps: true,
		});

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toHaveLength(1);
	});
});
