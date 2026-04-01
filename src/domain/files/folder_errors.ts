import { assertNever } from "../../common/types";

export type FolderError =
	| {
			readonly code: "read-failed";
			readonly dirPath: string;
			readonly cause: string;
	  }
	| { readonly code: "inaccessible-path"; readonly path: string };

export function formatFolderError(error: FolderError): string {
	switch (error.code) {
		case "read-failed":
			return `Could not read folder ${error.dirPath}: ${error.cause}. Check folder permissions.`;
		case "inaccessible-path":
			return `Path ${error.path} is not accessible. The file may have been moved or deleted.`;
		default:
			assertNever({ value: error });
	}
}
