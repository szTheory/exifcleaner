import type { MetadataEnginePort } from "../../application/metadata_engine_port";
import { cleanExifData } from "../../domain";
import {
	QUICKTIME_DATE_REMOVAL_ARGS,
	RAW_IDENTIFYING_TAG_DELETES,
} from "../../domain/exif/exif";
import {
	isMediaFile,
	isRawFile,
	isTiffFile,
} from "../../domain/files/file_types";
import type { Result } from "../../common";
import { assertNever } from "../../common/types";
import type { ExifError } from "../../domain";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";
import { classifyInspectionDiagnostics } from "./exiftool_diagnostics";
import {
	UnsafeExifToolPathError,
	type ExiftoolProcess,
} from "./ExiftoolProcess";

const UNSAFE_PATH_MESSAGE = "The selected file path is not supported";
// G1 identifies the physical metadata family (System/File/JFIF/EXIF/etc.) while G2 supplies
// the user-facing category. cleanExifData uses both to discard structural fields, then
// normalizes retained keys back to G2:Tag.
//
// G4 (family 4, "instance number") is required, not cosmetic: measured against the bundled
// binary (48-D06-SETTLEMENT.md), ExifTool's -json output suppresses duplicate same-name JSON
// entries, so a genuinely co-occurring ExifTool-group Error/Warning pair can silently
// collapse onto one JSON key -- which key survives is generation-order-dependent, not
// something classifyInspectionDiagnostics could ever recover from a JSON object it never
// received. -G4 disambiguates every duplicate (ExifTool-group or not) with a "CopyN"
// segment; cleanExifData's normalizeMetadataKey strips that segment again so ordinary
// displayed tag names are unaffected -- a single call, no added per-file round trip.
const DISPLAY_INSPECTION_ARGS = ["-G1:2:4"];
const OUTPUT_VERIFICATION_INSPECTION_ARGS = ["-File:FileType", "-File:Error"];
// A second call, not a merged arg set: ExifTool's -G option renames every JSON key to
// Group:Tag -- including File:FileType, which would break the plain-key guard above
// (measured: `-G1:2 -File:FileType` still renders the key as "File:Other:FileType", never
// "FileType"). This scan is the approved scope addition (48-01-PLAN.md
// base_architecture_amendment): this path previously checked only a plain `Error` field,
// never an ExifTool-group Warning at all.
const OUTPUT_VERIFICATION_DIAGNOSTIC_ARGS = ["-G1:2:4"];

// Adapter pattern: wraps the existing ExiftoolProcess with the semantic metadata engine
// interface. Does NOT modify ExiftoolProcess.ts (working infrastructure code).
// Converts ExiftoolProcess's { data, error } / throw pattern to Result<T, ExifError>.

export class ExifToolAdapter implements MetadataEnginePort {
	private readonly process: ExiftoolProcess;

	constructor({ process }: { process: ExiftoolProcess }) {
		this.process = process;
	}

	async open(): Promise<number> {
		return this.process.open();
	}

	async close(): Promise<Result<void>> {
		const result = await this.process.close();
		if (result.success) {
			return { ok: true, value: undefined };
		}
		return {
			ok: false,
			error: result.error?.message ?? "Failed to close ExifTool",
		};
	}

	private async readInspection({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<Record<string, unknown>[], ExifError>> {
		try {
			const result = await this.process.readMetadata({ filePath, args });

			if (result.error !== null) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: result.error },
				};
			}

			if (result.data === null) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: "No data returned" },
				};
			}

			return { ok: true, value: result.data };
		} catch (error) {
			if (error instanceof UnsafeExifToolPathError) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: UNSAFE_PATH_MESSAGE },
				};
			}
			return { ok: false, error: { code: "process-not-open" } };
		}
	}

	async inspect({
		source,
		purpose,
	}: {
		source: string;
		purpose: "display" | "output-verification";
	}): ReturnType<MetadataEnginePort["inspect"]> {
		if (purpose === "output-verification") {
			return this.inspectOutputVerification({ source });
		}
		return this.inspectDisplay({ source });
	}

	private async inspectDisplay({
		source,
	}: {
		source: string;
	}): ReturnType<MetadataEnginePort["inspect"]> {
		const result = await this.readInspection({
			filePath: source,
			args: DISPLAY_INSPECTION_ARGS,
		});
		if (!result.ok) {
			return { ok: false, error: toMetadataEngineError(result.error) };
		}

		const firstRecord = result.value[0];
		if (firstRecord === undefined) {
			return {
				ok: true,
				value: {
					metadata: {},
					recordCount: 0,
					verification: { fileType: undefined, error: undefined },
				},
			};
		}

		const verdict = classifyInspectionDiagnostics({
			record: firstRecord,
			purpose: "display",
		});
		if (verdict.fatal) {
			return {
				ok: false,
				error: {
					code: "engine-error",
					detail: verdict.detail,
					backend: "exiftool",
				},
			};
		}

		return {
			ok: true,
			value: {
				metadata: cleanExifData({ raw: firstRecord }),
				recordCount: result.value.length,
				verification: {
					fileType: firstRecord.FileType,
					error: firstRecord.Error,
				},
			},
		};
	}

	private async inspectOutputVerification({
		source,
	}: {
		source: string;
	}): ReturnType<MetadataEnginePort["inspect"]> {
		const result = await this.readInspection({
			filePath: source,
			args: OUTPUT_VERIFICATION_INSPECTION_ARGS,
		});
		if (!result.ok) {
			return { ok: false, error: toMetadataEngineError(result.error) };
		}

		const firstRecord = result.value[0];
		if (firstRecord === undefined) {
			return {
				ok: true,
				value: {
					metadata: {},
					recordCount: 0,
					verification: { fileType: undefined, error: undefined },
				},
			};
		}

		const diagnosticResult = await this.readInspection({
			filePath: source,
			args: OUTPUT_VERIFICATION_DIAGNOSTIC_ARGS,
		});
		if (!diagnosticResult.ok) {
			return {
				ok: false,
				error: toMetadataEngineError(diagnosticResult.error),
			};
		}

		// Fail closed, matching master's pre-refactor VerifyGeneratedOutputQuery: a diagnostic
		// scan that yields no record means the output could not be verified, NOT that it
		// verified clean. The caller cannot detect this itself -- recordCount below reports the
		// FIRST call's length, so an empty second scan would otherwise surface as a healthy
		// recordCount of 1 with no error. Skipping the fatal check here would accept a file
		// ExifTool never actually re-read.
		const diagnosticRecord = diagnosticResult.value[0];
		if (diagnosticRecord === undefined) {
			return {
				ok: false,
				error: {
					code: "engine-error",
					detail: "Expected exactly one ExifTool metadata record",
					backend: "exiftool",
				},
			};
		}

		const verdict = classifyInspectionDiagnostics({
			record: diagnosticRecord,
			purpose: "output-verification",
		});
		if (verdict.fatal) {
			return {
				ok: false,
				error: {
					code: "engine-error",
					detail: verdict.detail,
					backend: "exiftool",
				},
			};
		}

		return {
			ok: true,
			value: {
				metadata: {},
				recordCount: result.value.length,
				verification: {
					fileType: firstRecord.FileType,
					error: firstRecord.Error,
				},
			},
		};
	}

	async sanitize({
		source,
		destination,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		signal,
	}: Parameters<MetadataEnginePort["sanitize"]>[0]): ReturnType<
		MetadataEnginePort["sanitize"]
	> {
		if (signal?.aborted) {
			return { ok: false, error: { code: "engine-error", detail: "Aborted" } };
		}

		const extraArgs = ["-all="];
		if (isMediaFile({ filename: source })) {
			extraArgs.push(...QUICKTIME_DATE_REMOVAL_ARGS);
		}
		// -all= cannot clear IFD0 on a TIFF because IFD0 is the image directory, so the
		// CommonIFD0 shortcut deletes its descriptive/camera tags (EVIDENCE F-2, #199).
		if (isTiffFile({ filename: source })) {
			extraArgs.push("-CommonIFD0=");
		}
		// RMV-05: RAW's IFD0/ExifIFD/MakerNotes tags survive bare -all= the way TIFF's do, but
		// -CommonIFD0= (TIFF's fix) deletes Make/Model on RAW -- measured, not assumed. Push the
		// group-qualified named-tag deletes instead, plus RAW's own copy of the QuickTime args
		// for CR3 (ISO-BMFF; isRawFile and isMediaFile are disjoint, so this branch must push
		// its own copy rather than relying on the isMediaFile branch above).
		if (isRawFile({ filename: source })) {
			extraArgs.push(...RAW_IDENTIFYING_TAG_DELETES);
			extraArgs.push(...QUICKTIME_DATE_REMOVAL_ARGS);
		}

		const preserveTags: string[] = [];
		if (preserveOrientation) preserveTags.push("-Orientation");
		if (preserveColorProfile) preserveTags.push("-ICC_Profile");
		if (preserveTags.length > 0) {
			extraArgs.push("-TagsFromFile", "@", ...preserveTags);
		}
		if (preserveTimestamps) extraArgs.push("-P");
		if (destination !== undefined) {
			extraArgs.push("-o", destination);
		} else {
			extraArgs.push("-overwrite_original");
		}

		try {
			const result = await this.process.writeMetadata({
				filePath: source,
				metadata: {},
				extraArgs,
			});

			if (result.error !== null) {
				return {
					ok: false,
					error: {
						code: "engine-error",
						detail: result.error,
						backend: "exiftool",
					},
				};
			}

			return { ok: true, value: undefined };
		} catch (error) {
			if (error instanceof UnsafeExifToolPathError) {
				return {
					ok: false,
					error: {
						code: "engine-error",
						detail: UNSAFE_PATH_MESSAGE,
						backend: "exiftool",
					},
				};
			}
			return {
				ok: false,
				error: { code: "engine-unavailable", backend: "exiftool" },
			};
		}
	}
}

function toMetadataEngineError(error: ExifError): MetadataEngineError {
	switch (error.code) {
		case "engine-unavailable":
		case "engine-error":
		case "native-error":
			return error;
		case "process-not-open":
			return { code: "engine-unavailable", backend: "exiftool" };
		case "exiftool-error":
			return {
				code: "engine-error",
				detail: error.detail,
				backend: "exiftool",
			};
		case "spawn-failed":
		case "command-timeout":
		case "process-exited":
		case "parse-failed":
			return {
				code: "engine-error",
				detail: "The metadata engine could not inspect the selected file",
				backend: "exiftool",
			};
		default:
			return assertNever({ value: error });
	}
}
