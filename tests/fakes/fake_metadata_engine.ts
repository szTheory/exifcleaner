import type { MetadataEnginePort } from "../../src/application/metadata_engine_port";
import type { Result } from "../../src/common/result";
import type { MetadataEngineError } from "../../src/domain/exif/exif_errors";

type MetadataEngineCall =
	| {
			readonly method: "inspect";
			readonly request: {
				readonly source: string;
				readonly purpose: "display" | "output-verification";
			};
	  }
	| {
			readonly method: "sanitize";
			readonly request: {
				readonly source: string;
				readonly destination?: string | undefined;
				readonly preserveOrientation: boolean;
				readonly preserveColorProfile: boolean;
				readonly preserveTimestamps: boolean;
				readonly signal?: AbortSignal | undefined;
			};
	  };

export class FakeMetadataEngine implements MetadataEnginePort {
	calls: MetadataEngineCall[] = [];

	inspectResult: Result<
		{
			metadata: Record<string, unknown>;
			recordCount: number;
			verification: { fileType: unknown; error: unknown };
		},
		MetadataEngineError
	> = {
		ok: true,
		value: {
			metadata: { FileName: "test.jpg" },
			recordCount: 1,
			verification: { fileType: "JPEG", error: undefined },
		},
	};

	sanitizeResult: Result<void, MetadataEngineError> = {
		ok: true,
		value: undefined,
	};

	async inspect({
		source,
		purpose,
	}: {
		source: string;
		purpose: "display" | "output-verification";
	}): Promise<typeof this.inspectResult> {
		this.calls.push({ method: "inspect", request: { source, purpose } });
		return this.inspectResult;
	}

	async sanitize({
		source,
		destination,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		signal,
	}: {
		source: string;
		destination?: string | undefined;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		signal?: AbortSignal | undefined;
	}): Promise<typeof this.sanitizeResult> {
		this.calls.push({
			method: "sanitize",
			request: {
				source,
				destination,
				preserveOrientation,
				preserveColorProfile,
				preserveTimestamps,
				...(destination === undefined ? {} : { destination }),
				...(signal === undefined ? {} : { signal }),
			},
		});
		return this.sanitizeResult;
	}
}
