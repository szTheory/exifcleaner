import { beforeEach, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import type { MetadataEnginePort } from "../../src/application/metadata_engine_port";

let metadataEngine: MetadataEnginePort;
let sanitize: ReturnType<typeof vi.fn>;
let command: StripMetadataCommand;

beforeEach(() => {
	sanitize = vi.fn().mockResolvedValue({ ok: true, value: undefined });
	metadataEngine = {
		inspect: vi.fn(),
		sanitize,
	};
	command = new StripMetadataCommand({ metadataEngine });
});

describe("semantic sanitization", () => {
	it("forwards the complete request to the engine without interpreting output policy", async () => {
		const controller = new AbortController();

		await expect(
			command.execute({
				filePath: "/tmp/photo.jpg",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveTimestamps: true,
				saveAsCopy: true,
				outputPath: "/tmp/photo_cleaned.jpg",
				signal: controller.signal,
			}),
		).resolves.toEqual({ ok: true, value: { tagsRemoved: 0 } });

		expect(sanitize).toHaveBeenCalledOnce();
		expect(sanitize).toHaveBeenCalledWith({
			source: "/tmp/photo.jpg",
			destination: "/tmp/photo_cleaned.jpg",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: true,
			signal: controller.signal,
		});
	});

	it("forwards an absent destination without forwarding saveAsCopy", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		expect(sanitize).toHaveBeenCalledWith({
			source: "/tmp/photo.jpg",
			destination: undefined,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			signal: undefined,
		});
	});

	it("rejects an already-aborted request before calling the engine", async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			command.execute({
				filePath: "/tmp/photo.jpg",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
				saveAsCopy: false,
				signal: controller.signal,
			}),
		).resolves.toEqual({
			ok: false,
			error: { code: "engine-error", detail: "Aborted" },
		});

		expect(sanitize).not.toHaveBeenCalled();
	});

	it("propagates engine-neutral failures", async () => {
		sanitize.mockResolvedValue({
			ok: false,
			error: { code: "engine-unavailable" },
		});

		await expect(
			command.execute({
				filePath: "/tmp/photo.jpg",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
				saveAsCopy: false,
			}),
		).resolves.toEqual({ ok: false, error: { code: "engine-unavailable" } });
	});
});
