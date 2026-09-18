import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import type { MetadataEnginePort } from "../metadata_engine_port";

export class ReadMetadataQuery {
	private readonly metadataEngine: MetadataEnginePort;

	constructor({ metadataEngine }: { metadataEngine: MetadataEnginePort }) {
		this.metadataEngine = metadataEngine;
	}

	async execute({
		filePath,
	}: {
		filePath: string;
	}): Promise<Result<Record<string, unknown>, ExifError>> {
		const result = await this.metadataEngine.inspect({
			source: filePath,
			purpose: "display",
		});

		if (!result.ok) {
			return result;
		}

		return { ok: true, value: result.value.metadata };
	}
}
