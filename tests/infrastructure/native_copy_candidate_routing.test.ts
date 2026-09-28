import { describe, expect, it } from "vitest";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import type { NativeFormatCapabilities } from "../../src/infrastructure/metadata/native_metadata_port";
import { FakeMetadataEngine } from "../fakes/fake_metadata_engine";
import { FakeNativeMetadata } from "../fakes/fake_native_metadata";

// D-06 (SC1): pins the routing decision itself, per capability and per
// preservation clause, over the fake capability table mirroring exifcleaner-node
// 0.3.0 (three real formats: webp/png/jpeg, real extension arrays — never an
// empty extensions array, which would make every case fall through to
// ExifTool and pass for the wrong reason). Task 2 shows this file red on both
// regressions it exists to catch (missing resolution clause, any-format
// lookup) and restores hybrid_metadata_engine.ts byte-for-byte afterward.

type PreservationRequestKey =
	| "preserveOrientation"
	| "preserveColorProfile"
	| "preserveTimestamps"
	| "preserveResolution";

type PreservationCapabilityKey =
	| "orientation"
	| "colorProfile"
	| "timestamps"
	| "resolution";

function baseRequest({
	source,
	destination,
	outputMode = "copy" as const,
	preserveOrientation = false,
	preserveColorProfile = false,
	preserveTimestamps = false,
	preserveResolution = false,
}: {
	source: string;
	destination?: string;
	outputMode?: "copy" | "overwrite";
	preserveOrientation?: boolean;
	preserveColorProfile?: boolean;
	preserveTimestamps?: boolean;
	preserveResolution?: boolean;
}) {
	return {
		source,
		destination,
		outputMode,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		preserveResolution,
	};
}

describe("native copy candidate routing (D-06)", () => {
	it("D-06: a WebP save-as-copy asking to keep resolution routes to ExifTool and never to native", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = baseRequest({
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			preserveResolution: true,
		});

		const result = await engine.sanitize(request);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
	});

	it.each([
		[".png", "/files/source.png", "/files/clean.png"],
		[".jpg", "/files/source.jpg", "/files/clean.jpg"],
		[".jpeg", "/files/source.jpeg", "/files/clean.jpeg"],
		[".JPG (case-insensitive)", "/files/source.JPG", "/files/clean.JPG"],
	])(
		"companion positive: %s save-as-copy asking to keep resolution routes to native once, ExifTool zero times",
		async (_label, source, destination) => {
			const exiftool = new FakeMetadataEngine();
			const native = new FakeNativeMetadata();
			const engine = new HybridMetadataEngine({ exiftool, native });
			const request = baseRequest({
				source,
				destination,
				preserveResolution: true,
			});

			const result = await engine.sanitize(request);

			expect(result).toEqual({ ok: true, value: undefined });
			expect(native.sanitizeCalls).toEqual([request]);
			expect(
				exiftool.calls.filter((call) => call.method === "sanitize"),
			).toEqual([]);
		},
	);

	it("a WebP save-as-copy not asking to keep resolution routes to native once", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = baseRequest({
			source: "/files/source.webp",
			destination: "/files/clean.webp",
			preserveResolution: false,
		});

		const result = await engine.sanitize(request);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(native.sanitizeCalls).toEqual([request]);
		expect(
			exiftool.calls.filter((call) => call.method === "sanitize"),
		).toEqual([]);
	});

	it.each([
		[".jpe", "/files/source.jpe", "/files/clean.jpe"],
		[".jfif", "/files/source.jfif", "/files/clean.jfif"],
		["extensionless", "/files/noext", "/files/clean-noext"],
	])(
		"edge: %s source routes to ExifTool with zero native calls",
		async (_label, source, destination) => {
			const exiftool = new FakeMetadataEngine();
			const native = new FakeNativeMetadata();
			const engine = new HybridMetadataEngine({ exiftool, native });
			const request = baseRequest({ source, destination });

			const result = await engine.sanitize(request);

			expect(result).toBe(exiftool.sanitizeResult);
			expect(native.sanitizeCalls).toEqual([]);
			expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
		},
	);

	it("edge: two capabilities both listing .png route a .png request to ExifTool", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const pngCapability: NativeFormatCapabilities = {
			format: "png",
			extensions: [".png"],
			sanitize: true,
			detection: "magic",
			preserves: {
				orientation: true,
				colorProfile: true,
				timestamps: true,
				resolution: true,
			},
		};
		native.capabilities = {
			formats: [pngCapability, { ...pngCapability, format: "png-alt" }],
		};
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = baseRequest({
			source: "/files/source.png",
			destination: "/files/clean.png",
		});

		const result = await engine.sanitize(request);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
	});

	it("an overwrite-mode .png request routes to ExifTool (unchanged guard)", async () => {
		const exiftool = new FakeMetadataEngine();
		const native = new FakeNativeMetadata();
		const engine = new HybridMetadataEngine({ exiftool, native });
		const request = baseRequest({
			source: "/files/source.png",
			destination: "/files/source.png",
			outputMode: "overwrite",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			preserveResolution: true,
		});

		const result = await engine.sanitize(request);

		expect(result).toBe(exiftool.sanitizeResult);
		expect(native.sanitizeCalls).toEqual([]);
		expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
	});

	describe("every requested preservation is covered", () => {
		const PRESERVATION_CASES: {
			label: string;
			requestKey: PreservationRequestKey;
			capabilityKey: PreservationCapabilityKey;
		}[] = [
			{
				label: "orientation",
				requestKey: "preserveOrientation",
				capabilityKey: "orientation",
			},
			{
				label: "colorProfile",
				requestKey: "preserveColorProfile",
				capabilityKey: "colorProfile",
			},
			{
				label: "timestamps",
				requestKey: "preserveTimestamps",
				capabilityKey: "timestamps",
			},
			{
				label: "resolution",
				requestKey: "preserveResolution",
				capabilityKey: "resolution",
			},
		];

		function capabilityLacking(
			capabilityKey: PreservationCapabilityKey,
		): NativeFormatCapabilities {
			return {
				format: "png",
				extensions: [".png"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: capabilityKey !== "orientation",
					colorProfile: capabilityKey !== "colorProfile",
					timestamps: capabilityKey !== "timestamps",
					resolution: capabilityKey !== "resolution",
				},
			};
		}

		function requestAsking(
			requestKey: PreservationRequestKey,
			value: boolean,
		) {
			return baseRequest({
				source: "/files/source.png",
				destination: "/files/clean.png",
				preserveOrientation:
					requestKey === "preserveOrientation" ? value : false,
				preserveColorProfile:
					requestKey === "preserveColorProfile" ? value : false,
				preserveTimestamps:
					requestKey === "preserveTimestamps" ? value : false,
				preserveResolution:
					requestKey === "preserveResolution" ? value : false,
			});
		}

		for (const { label, requestKey, capabilityKey } of PRESERVATION_CASES) {
			it(`a request asking to keep ${label} routes to ExifTool when the capability lacks it`, async () => {
				const exiftool = new FakeMetadataEngine();
				const native = new FakeNativeMetadata();
				native.capabilities = { formats: [capabilityLacking(capabilityKey)] };
				const engine = new HybridMetadataEngine({ exiftool, native });
				const request = requestAsking(requestKey, true);

				const result = await engine.sanitize(request);

				expect(result).toBe(exiftool.sanitizeResult);
				expect(native.sanitizeCalls).toEqual([]);
				expect(exiftool.calls).toEqual([{ method: "sanitize", request }]);
			});

			it(`a request not asking to keep ${label} routes to native when the capability lacks it`, async () => {
				const exiftool = new FakeMetadataEngine();
				const native = new FakeNativeMetadata();
				native.capabilities = { formats: [capabilityLacking(capabilityKey)] };
				const engine = new HybridMetadataEngine({ exiftool, native });
				const request = requestAsking(requestKey, false);

				const result = await engine.sanitize(request);

				expect(result).toEqual({ ok: true, value: undefined });
				expect(native.sanitizeCalls).toEqual([request]);
				expect(
					exiftool.calls.filter((call) => call.method === "sanitize"),
				).toEqual([]);
			});
		}
	});
});
