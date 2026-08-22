import type { MetadataEnginePort } from "../../application/metadata_engine_port";
import { cleanExifData } from "../../domain";
import { QUICKTIME_DATE_REMOVAL_ARGS } from "../../domain/exif/exif";
import { isMediaFile } from "../../domain/files/file_types";
import type { Result } from "../../common";
import { assertNever } from "../../common/types";
import type { ExifError } from "../../domain";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";
import {
	UnsafeExifToolPathError,
	type ExiftoolProcess,
} from "./ExiftoolProcess";

const UNSAFE_PATH_MESSAGE = "The selected file path is not supported";
const DISPLAY_INSPECTION_ARGS = ["-G1:2"];
const OUTPUT_VERIFICATION_INSPECTION_ARGS = ["-File:FileType", "-File:Error"];

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
		const args =
			purpose === "display"
				? DISPLAY_INSPECTION_ARGS
				: OUTPUT_VERIFICATION_INSPECTION_ARGS;
		const result = await this.readInspection({ filePath: source, args });
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

		const diagnostic = Object.entries(firstRecord).find(([key]) => {
			const parts = key.split(":");
			const tag = parts.at(-1);
			return parts[0] === "ExifTool" && (tag === "Error" || tag === "Warning");
		});
		if (diagnostic !== undefined) {
			return {
				ok: false,
				error: {
					code: "engine-error",
					detail: String(diagnostic[1]),
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
