import { assertNever } from "../../common/types";

export type ExifError =
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
		default:
			assertNever({ value: error });
	}
}
