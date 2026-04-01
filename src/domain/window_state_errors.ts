import { assertNever } from "../common/types";

export type WindowStateError = {
	readonly code: "save-failed";
	readonly filePath: string;
	readonly cause: string;
};

export function formatWindowStateError(error: WindowStateError): string {
	switch (error.code) {
		case "save-failed":
			return `Could not save window state to ${error.filePath}: ${error.cause}. Window position will reset on next launch.`;
		default:
			assertNever({ value: error as never });
	}
}
