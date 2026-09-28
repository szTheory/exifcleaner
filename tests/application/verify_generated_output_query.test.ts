import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataEnginePort } from "../../src/application/metadata_engine_port";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";

let metadataEngine: MetadataEnginePort;
let query: VerifyGeneratedOutputQuery;

beforeEach(() => {
	// A successful generated artifact is one structured, recognized ExifTool record.
	metadataEngine = {
		inspect: vi.fn().mockResolvedValue({
			ok: true,
			value: {
				metadata: {},
				recordCount: 1,
				verification: { fileType: "RAF", error: undefined },
			},
		}),
		sanitize: vi.fn(),
	};
	query = new VerifyGeneratedOutputQuery({ metadataEngine });
});

describe("VerifyGeneratedOutputQuery", () => {
	it("reopens only the supplied generated path once", async () => {
		const generatedPath = "/tmp/sample_cleaned.raf";

		const result = await query.execute({ generatedPath });

		expect(result).toEqual({ ok: true, value: undefined });
		expect(metadataEngine.inspect).toHaveBeenCalledOnce();
		expect(metadataEngine.inspect).toHaveBeenCalledWith({
			source: generatedPath,
			purpose: "output-verification",
		});
	});

	it.each([
		{
			description: "port failure",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: false,
					error: { code: "engine-unavailable", backend: "exiftool" },
				});
			},
		},
		{
			description: "no records",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: {},
						recordCount: 0,
						verification: { fileType: undefined, error: undefined },
					},
				});
			},
		},
		{
			description: "multiple records",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: {},
						recordCount: 2,
						verification: { fileType: "RAF", error: undefined },
					},
				});
			},
		},
		{
			description: "missing file type",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: {},
						recordCount: 1,
						verification: { fileType: undefined, error: undefined },
					},
				});
			},
		},
		{
			description: "empty file type",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: {},
						recordCount: 1,
						verification: { fileType: "", error: undefined },
					},
				});
			},
		},
		{
			description: "ExifTool Error",
			setResult: () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: {},
						recordCount: 1,
						verification: { fileType: "RAF", error: "bad output" },
					},
				});
			},
		},
	])("rejects $description", async ({ setResult }) => {
		setResult();

		const result = await query.execute({
			generatedPath: "/tmp/sample_cleaned.raf",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("output-verification-failed");
		}
	});

	it("accepts a warning-only recognized record", async () => {
		vi.mocked(metadataEngine.inspect).mockResolvedValue({
			ok: true,
			value: {
				metadata: {},
				recordCount: 1,
				verification: { fileType: "MP4", error: undefined },
			},
		});

		await expect(
			query.execute({ generatedPath: "/tmp/sample_cleaned.mp4" }),
		).resolves.toEqual({ ok: true, value: undefined });
	});

	describe("copyModeLeakCheck (D-10, opt-in)", () => {
		const cleanPreservation = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};

		it("does not affect any existing case when omitted", async () => {
			// Identical to today for every existing case -- exercised via the RAF/warning-only
			// cases above, which call execute() without copyModeLeakCheck at all.
			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.raf",
			});
			expect(result).toEqual({ ok: true, value: undefined });
		});

		it("passes a clean PNG record", async () => {
			vi.mocked(metadataEngine.inspect).mockResolvedValue({
				ok: true,
				value: {
					metadata: { "PNG:BitDepth": 8, "File:FileType": "PNG" },
					recordCount: 1,
					verification: { fileType: "PNG", error: undefined },
				},
			});

			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.png",
				copyModeLeakCheck: cleanPreservation,
			});

			expect(result).toEqual({ ok: true, value: undefined });
		});

		it("passes a clean JPEG record", async () => {
			vi.mocked(metadataEngine.inspect).mockResolvedValue({
				ok: true,
				value: {
					metadata: { "File:FileType": "JPEG" },
					recordCount: 1,
					verification: { fileType: "JPEG", error: undefined },
				},
			});

			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.jpg",
				copyModeLeakCheck: cleanPreservation,
			});

			expect(result).toEqual({ ok: true, value: undefined });
		});

		it("flags a leaked XMP-dc:Creator tag with the distinct leak code, names only", async () => {
			const leakedValue = "ZZLEAK-58-SENTINEL-VALUE";
			vi.mocked(metadataEngine.inspect).mockResolvedValue({
				ok: true,
				value: {
					metadata: {
						"File:FileType": "JPEG",
						"XMP-dc:Creator": leakedValue,
					},
					recordCount: 1,
					verification: { fileType: "JPEG", error: undefined },
				},
			});

			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.jpg",
				copyModeLeakCheck: cleanPreservation,
			});

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.code).toBe("output-metadata-leak");
			if (result.error.code !== "output-metadata-leak") return;
			expect(result.error.leakedTags).toEqual(["XMP-dc:Creator"]);
			expect(result.error.detail).toContain("XMP-dc:Creator");
			expect(result.error.detail).not.toContain(leakedValue);
			expect(JSON.stringify(result.error)).not.toContain(leakedValue);
		});

		it("fails closed with output-metadata-leak when the reopened FileType is neither PNG nor JPEG", async () => {
			vi.mocked(metadataEngine.inspect).mockResolvedValue({
				ok: true,
				value: {
					metadata: { "File:FileType": "WEBP" },
					recordCount: 1,
					verification: { fileType: "WEBP", error: undefined },
				},
			});

			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.webp",
				copyModeLeakCheck: cleanPreservation,
			});

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.code).toBe("output-metadata-leak");
		});
	});
});
