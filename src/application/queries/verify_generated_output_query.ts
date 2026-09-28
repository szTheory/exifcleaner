import type { Result } from "../../common";
import {
	copyModeLeakCheckFormatOf,
	findLeakedTags,
} from "../../domain/exif/copy_mode_leak_check";
import type { MetadataEnginePort } from "../metadata_engine_port";

export type OutputVerificationError =
	| {
			readonly code: "output-verification-failed";
			readonly detail: string;
	  }
	| {
			readonly code: "output-metadata-leak";
			readonly detail: string;
			readonly leakedTags: readonly string[];
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
		copyModeLeakCheck,
	}: {
		generatedPath: string;
		/**
		 * Opt-in (D-10/D-11): populated only by PNG/JPEG copy-mode call sites. When present,
		 * after every existing check passes, the reopened output's diagnostic record is
		 * checked against the measured fail-closed allowlist (58-SWEEP-MATRIX.md). Absent for
		 * every other verification call site -- RAW/TIFF/media/WebP behaviour is unchanged.
		 */
		copyModeLeakCheck?:
			| {
					preserveOrientation: boolean;
					preserveColorProfile: boolean;
					preserveResolution: boolean;
			  }
			| undefined;
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

		if (copyModeLeakCheck !== undefined) {
			const format = copyModeLeakCheckFormatOf({ fileType });
			if (format === undefined) {
				return leakFailure({
					detail:
						"Copy-mode leak check has no permitted-tag set for this file type",
					leakedTags: [],
				});
			}

			const leakedTags = findLeakedTags({
				record: result.value.metadata,
				format,
				preservation: copyModeLeakCheck,
			});
			if (leakedTags.length > 0) {
				return leakFailure({
					detail: `Generated output kept ${leakedTags.length} metadata tag(s) outside the permitted set: ${leakedTags.join(", ")}`,
					leakedTags,
				});
			}
		}

		return { ok: true, value: undefined };
	}
}

function verificationFailure(
	detail: string,
): Result<void, OutputVerificationError> {
	return { ok: false, error: { code: "output-verification-failed", detail } };
}

function leakFailure({
	detail,
	leakedTags,
}: {
	detail: string;
	leakedTags: readonly string[];
}): Result<void, OutputVerificationError> {
	return {
		ok: false,
		error: { code: "output-metadata-leak", detail, leakedTags },
	};
}
