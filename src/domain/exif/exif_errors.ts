import { assertNever } from "../../common/types";

export type MetadataEngineError =
	| { readonly code: "engine-unavailable"; readonly backend?: "exiftool" }
	| {
			readonly code: "engine-error";
			readonly detail: string;
			readonly backend?: "exiftool";
	  };

type LegacyExifError =
	| { readonly code: "process-not-open" }
	| { readonly code: "spawn-failed"; readonly binPath: string }
	| { readonly code: "command-timeout"; readonly executeNum: number }
	| {
			readonly code: "process-exited";
			readonly exitCode: number | null;
			readonly signal: string | null;
	  }
	| { readonly code: "parse-failed"; readonly raw: string }
	| { readonly code: "exiftool-error"; readonly detail: string };

/** @deprecated Use MetadataEngineError for semantic engine boundaries. */
export type ExifError = LegacyExifError | MetadataEngineError;

export function formatMetadataEngineError(error: MetadataEngineError): string {
	switch (error.code) {
		case "engine-unavailable":
			return error.backend === "exiftool"
				? "ExifTool is not running. Restart the app to retry."
				: "Metadata engine is not running. Restart the app to retry.";
		case "engine-error":
			return error.backend === "exiftool"
				? `ExifTool error: ${error.detail}`
				: `Metadata engine error: ${error.detail}`;
		default:
			assertNever({ value: error });
	}
}

/** @deprecated Use formatMetadataEngineError for semantic engine boundaries. */
export function formatExifError(error: ExifError): string {
	switch (error.code) {
		case "process-not-open":
			return "ExifTool is not running. Restart the app to retry.";
		case "spawn-failed":
			return `Could not start ExifTool at ${error.binPath}. Reinstall the app.`;
		case "command-timeout":
			return "ExifTool took too long to respond. Try processing the file again.";
		case "process-exited":
			return "ExifTool crashed unexpectedly. Restart the app to retry.";
		case "parse-failed":
			return "ExifTool returned unreadable output. Try processing the file again.";
		case "exiftool-error":
			return `ExifTool error: ${error.detail}`;
		case "engine-unavailable":
		case "engine-error":
			return formatMetadataEngineError(error);
		default:
			assertNever({ value: error });
	}
}
