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
});
