import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeWebp } from "../fakes/fake_native_webp";

describe("HybridMetadataEngine", () => {
	it("keeps both inspection purposes on ExifTool", async () => {
		const exiftool = new FakeMetadataEngine();
		const nativeWebp = new FakeNativeWebp();
		const engine = new HybridMetadataEngine({ exiftool, nativeWebp });

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
		expect(nativeWebp.sanitizeCalls).toEqual([]);
	});

	it("routes an admitted WebP save-as-copy request to native once", async () => {
		const exiftool = new FakeMetadataEngine();
		const nativeWebp = new FakeNativeWebp();
		const engine = new HybridMetadataEngine({ exiftool, nativeWebp });
		const controller = new AbortController();
		const request = {
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			signal: controller.signal,
		};

		const result = await engine.sanitize(request);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(nativeWebp.sanitizeCalls).toEqual([request]);
		expect(exiftool.calls.filter((call) => call.method === "sanitize")).toEqual(
			[],
		);
	});
});
