import type { Result } from "../../common";
import {
	copyModeLeakCheckFormatOf,
	findLeakedTags,
} from "../../domain/exif/copy_mode_leak_check";
import type { CopyModeLeakCheckDemand } from "../../domain/files/file_types";
import type { MetadataEnginePort, WrittenBy } from "../metadata_engine_port";

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
		 * Opt-in (D-08/D-10/D-11): populated by every verified copy-mode call site. When present,
		 * after every existing check passes, a reopened FileType with an allowlist is checked
		 * against the measured fail-closed allowlist (58-SWEEP-MATRIX.md). `demand` decides the
		 * outcome for a FileType without an allowlist: "required" fails closed, "when-allowlisted"
		 * stays verify-only (genuine WebP/RAW/TIFF/media). Absent for overwrite-mode call sites.
		 */
		copyModeLeakCheck?:
			| {
					demand: CopyModeLeakCheckDemand;
					preserveOrientation: boolean;
					preserveColorProfile: boolean;
					preserveResolution: boolean;
					writtenBy: WrittenBy;
			  }
			| undefined;
	}): Promise<
		Result<{ exemptionsApplied: readonly string[] }, OutputVerificationError>
	> {
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
				if (copyModeLeakCheck.demand === "when-allowlisted") {
					return { ok: true, value: { exemptionsApplied: [] } };
				}
				return leakFailure({
					detail:
						"Copy-mode leak check has no permitted-tag set for this file type",
					leakedTags: [],
				});
			}

			const { leakedTags, exemptionsApplied } = findLeakedTags({
				record: result.value.metadata,
				format,
				preservation: copyModeLeakCheck,
				writtenBy: copyModeLeakCheck.writtenBy,
				fileType,
			});
			if (leakedTags.length > 0) {
				return leakFailure({
					detail: `Generated output kept ${leakedTags.length} metadata tag(s) outside the permitted set: ${leakedTags.join(", ")}`,
					leakedTags,
				});
			}
			return { ok: true, value: { exemptionsApplied } };
		}

		return { ok: true, value: { exemptionsApplied: [] } };
	}
}

function verificationFailure(
	detail: string,
): Result<{ exemptionsApplied: readonly string[] }, OutputVerificationError> {
	return { ok: false, error: { code: "output-verification-failed", detail } };
}

function leakFailure({
	detail,
	leakedTags,
}: {
	detail: string;
	leakedTags: readonly string[];
}): Result<{ exemptionsApplied: readonly string[] }, OutputVerificationError> {
	return {
		ok: false,
		error: { code: "output-metadata-leak", detail, leakedTags },
	};
}
