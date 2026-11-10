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

		expect(result).toEqual({ ok: true, value: { exemptionsApplied: [] } });
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
		).resolves.toEqual({ ok: true, value: { exemptionsApplied: [] } });
	});

	describe("copyModeLeakCheck (D-10, opt-in)", () => {
		const cleanPreservation = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			demand: "required" as const,
			writtenBy: "exiftool" as const,
		};

		it("does not affect any existing case when omitted", async () => {
			// Identical to today for every existing case -- exercised via the RAF/warning-only
			// cases above, which call execute() without copyModeLeakCheck at all.
			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.raf",
			});
			expect(result).toEqual({ ok: true, value: { exemptionsApplied: [] } });
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

			expect(result).toEqual({ ok: true, value: { exemptionsApplied: [] } });
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

			expect(result).toEqual({ ok: true, value: { exemptionsApplied: [] } });
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

		it("fails closed with output-metadata-leak when the reopened FileType has no allowlist (a .webp name over MOV content, 69-09)", async () => {
			vi.mocked(metadataEngine.inspect).mockResolvedValue({
				ok: true,
				value: {
					metadata: { "File:FileType": "MOV" },
					recordCount: 1,
					verification: { fileType: "MOV", error: undefined },
				},
			});

			const result = await query.execute({
				generatedPath: "/tmp/sample_cleaned.webp",
				copyModeLeakCheck: cleanPreservation,
			});

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.code).toBe("output-metadata-leak");
			expect(result.error.detail).toBe(
				"Copy-mode leak check has no permitted-tag set for this file type (MOV)",
			);
		});

		describe("WebP (69-09, WEBP-08)", () => {
			const webp = (metadata: Record<string, unknown>, fileType = "WEBP") =>
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: { "File:FileType": fileType, ...metadata },
						recordCount: 1,
						verification: { fileType, error: undefined },
					},
				});

			it.each([
				"WEBP",
				"WEBP (lossless)",
				"Extended WEBP",
				"Extended WEBP (lossless)",
			])("passes a clean %s record under demand required", async (fileType) => {
				webp({ "RIFF:ImageWidth": 16 }, fileType);
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: cleanPreservation,
				});
				expect(result).toEqual({ ok: true, value: { exemptionsApplied: [] } });
			});

			it("flags a surviving XMP creator and GPS tag in a WebP, names only", async () => {
				const leakedValue = "ZZLEAK-69-SENTINEL-VALUE";
				webp(
					{
						"XMP-dc:Creator": leakedValue,
						"GPS:GPSLatitude": 12.5,
					},
					"Extended WEBP",
				);
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: cleanPreservation,
				});
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error.code).toBe("output-metadata-leak");
				if (result.error.code !== "output-metadata-leak") return;
				expect(result.error.leakedTags).toEqual([
					"GPS:GPSLatitude",
					"XMP-dc:Creator",
				]);
				expect(JSON.stringify(result.error)).not.toContain(leakedValue);
			});

			it("flags a WebP_Flags value naming XMP and judges the flags by their value", async () => {
				webp({ "RIFF:WebP_Flags": "XMP, EXIF" }, "Extended WEBP");
				const xmp = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: {
						...cleanPreservation,
						preserveOrientation: true,
					},
				});
				expect(xmp.ok).toBe(false);
				if (xmp.ok) return;
				if (xmp.error.code !== "output-metadata-leak") return;
				expect(xmp.error.leakedTags).toEqual(["RIFF:WebP_Flags"]);

				webp({ "RIFF:WebP_Flags": "Alpha" }, "Extended WEBP");
				const alpha = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: cleanPreservation,
				});
				expect(alpha).toEqual({ ok: true, value: { exemptionsApplied: [] } });
			});

			it("is leak-checked under demand when-allowlisted too: a genuine WebP with GPS leaks", async () => {
				webp({ "GPS:GPSLatitude": 12.5 });
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: {
						...cleanPreservation,
						demand: "when-allowlisted",
					},
				});
				expect(result.ok).toBe(false);
				if (result.ok) return;
				if (result.error.code !== "output-metadata-leak") return;
				expect(result.error.leakedTags).toEqual(["GPS:GPSLatitude"]);
			});
		});

		describe("demand when-allowlisted (D-08, F-63-3)", () => {
			const lenient = {
				...cleanPreservation,
				demand: "when-allowlisted" as const,
			};
			const reopened = (fileType: string, metadata: Record<string, unknown>) =>
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: true,
					value: {
						metadata: { "File:FileType": fileType, ...metadata },
						recordCount: 1,
						verification: { fileType, error: undefined },
					},
				});

			it("mismatch row 11: a .webp-named JPEG output with GPS fails the leak check", async () => {
				reopened("JPEG", { "GPS:GPSLatitude": 12.5 });
				const result = await query.execute({
					generatedPath: "/tmp/sample_cleaned.webp",
					copyModeLeakCheck: lenient,
				});
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error.code).toBe("output-metadata-leak");
				if (result.error.code !== "output-metadata-leak") return;
				expect(result.error.leakedTags).toContain("GPS:GPSLatitude");
			});

			it("mismatch row 11b: a .tif-named JPEG output with GPS fails the leak check", async () => {
				reopened("JPEG", { "GPS:GPSLatitude": 12.5 });
				const result = await query.execute({
					generatedPath: "/tmp/scan_cleaned.tif",
					copyModeLeakCheck: lenient,
				});
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error.code).toBe("output-metadata-leak");
			});

			it.each([
				["TIFF", "/tmp/a_cleaned.tif"],
				["DNG", "/tmp/a_cleaned.dng"],
				["MP4", "/tmp/a_cleaned.mp4"],
			])(
				"keeps a genuine %s output verify-only",
				async (fileType, generatedPath) => {
					reopened(fileType, {});
					const result = await query.execute({
						generatedPath,
						copyModeLeakCheck: lenient,
					});
					expect(result).toEqual({
						ok: true,
						value: { exemptionsApplied: [] },
					});
				},
			);

			it("passes a clean HEIC record", async () => {
				reopened("HEIC", {});
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: lenient,
				});
				expect(result.ok).toBe(true);
			});

			it("demand required keeps the no permitted-tag set failure text for a FileType without an allowlist (MOV behind a .webp name)", async () => {
				reopened("MOV", {});
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.webp",
					copyModeLeakCheck: cleanPreservation,
				});
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(result.error.code).toBe("output-metadata-leak");
				expect(result.error.detail).toBe(
					"Copy-mode leak check has no permitted-tag set for this file type (MOV)",
				);
				if (result.error.code !== "output-metadata-leak") return;
				expect(result.error.leakedTags).toEqual([]);
			});

			it("keeps the engine-error reopen failure as a code-only detail (69-04)", async () => {
				vi.mocked(metadataEngine.inspect).mockResolvedValue({
					ok: false,
					error: {
						code: "engine-error",
						detail: "/secret/path.png",
						backend: "exiftool",
					},
				} as never);
				const result = await query.execute({
					generatedPath: "/tmp/a_cleaned.png",
					copyModeLeakCheck: cleanPreservation,
				});
				expect(result).toEqual({
					ok: false,
					error: {
						code: "output-verification-failed",
						detail:
							"ExifTool could not reopen the generated output (engine-error)",
					},
				});
			});
		});
	});
});
