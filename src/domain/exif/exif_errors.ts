import type { MetadataError } from "exifcleaner-node";
import { assertNever } from "../../common/types";

export type NativeMetadataErrorCode =
	| "aborted"
	| "invalid-options"
	| "not-found"
	| "unsupported-format"
	| "malformed-file"
	| "unsafe-structure"
	| "unsupported-feature"
	| "source-changed"
	| "destination-exists"
	| "destination-changed"
	| "read-failed"
	| "write-failed"
	| "verification-failed"
	| "cleanup-failed";

export type MetadataEngineError =
	| { readonly code: "engine-unavailable"; readonly backend?: "exiftool" }
	| {
			readonly code: "engine-error";
			readonly detail: string;
			readonly backend?: "exiftool";
			// Set only by ExifToolAdapter.sanitize, after ExiftoolProcess confirmed the
			// writer's process tree exited (D-63). Gates OutputTransaction's cleanup() call.
			readonly confirmedDeadTimeout?: true;
	  }
	| {
			readonly code: "native-error";
			readonly nativeCode: NativeMetadataErrorCode;
			readonly detail: string;
			readonly path?: string;
			readonly feature?: string;
			readonly cause?: { readonly code?: string; readonly message: string };
			readonly backend: "native";
			// Declared explicitly (not smuggled through an object spread) so the
			// fallback-authority check compiles with no cast.
			readonly phase: MetadataError["phase"];
			readonly nativeWrite: MetadataError["nativeWrite"];
			// The unmapped library error, retained so fallback authority can be
			// minted from the real proof the library produced, never a
			// reconstructed stand-in.
			readonly libraryError: MetadataError;
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
		case "native-error":
			return "Metadata engine error: native processing failed.";
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
		case "native-error":
			return formatMetadataEngineError(error);
		default:
			assertNever({ value: error });
	}
}
