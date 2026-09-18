import type { Result } from "../../common";
import type { MetadataEnginePort } from "../metadata_engine_port";

export type OutputVerificationError = {
	readonly code: "output-verification-failed";
	readonly detail: string;
};

export class VerifyGeneratedOutputQuery {
	private readonly metadataEngine: MetadataEnginePort;

	constructor({
		metadataEngine,
		exiftool,
	}: {
		metadataEngine?: MetadataEnginePort;
		/** @deprecated Compatibility alias for existing callers during the container migration. */
		exiftool?: unknown;
	}) {
		this.metadataEngine = metadataEngine ?? (exiftool as MetadataEnginePort);
	}

	async execute({
		generatedPath,
	}: {
		generatedPath: string;
	}): Promise<Result<void, OutputVerificationError>> {
		const result = await this.metadataEngine.inspect({
			source: generatedPath,
			purpose: "output-verification",
		});

		if (!result.ok) {
			return verificationFailure(
				`ExifTool could not reopen the generated output (${result.error.code})`,
			);
		}

		if (result.value.recordCount !== 1) {
			return verificationFailure(
				"Expected exactly one ExifTool metadata record",
			);
		}

		const { fileType, error } = result.value.verification;
		if (typeof fileType !== "string" || fileType.length === 0) {
			return verificationFailure(
				"Generated output has no recognized file type",
			);
		}

		if (error !== undefined) {
			return verificationFailure(
				"ExifTool reported an error for the generated output",
			);
		}

		return { ok: true, value: undefined };
	}
}

function verificationFailure(
	detail: string,
): Result<void, OutputVerificationError> {
	return { ok: false, error: { code: "output-verification-failed", detail } };
}
