import { assertNever } from "../common/types";

export type SettingsError =
	| {
			readonly code: "read-failed";
			readonly filePath: string;
			readonly cause: string;
	  }
	| {
			readonly code: "write-failed";
			readonly filePath: string;
			readonly cause: string;
	  }
	| { readonly code: "invalid-format"; readonly filePath: string };

export function formatSettingsError(error: SettingsError): string {
	switch (error.code) {
		case "read-failed":
			return `Could not read settings from ${error.filePath}: ${error.cause}. Using defaults.`;
		case "write-failed":
			return `Could not save settings to ${error.filePath}: ${error.cause}. Changes kept in memory only.`;
		case "invalid-format":
			return `Settings file at ${error.filePath} has invalid format. Using defaults.`;
		default:
			assertNever({ value: error });
	}
}
