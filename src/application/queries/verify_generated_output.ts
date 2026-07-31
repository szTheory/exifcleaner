import type { Result } from "../../common";
import type { ExifToolPort } from "../exiftool_port";

export type OutputVerificationError = {
	readonly code: "output-verification-failed";
	readonly detail: string;
};

export class VerifyGeneratedOutputQuery {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		generatedPath,
	}: {
		generatedPath: string;
	}): Promise<Result<void, OutputVerificationError>> {
		const result = await this.exiftool.readMetadata({
			filePath: generatedPath,
			args: ["-File:FileType", "-File:Error"],
		});

		if (!result.ok) {
			return verificationFailure(
				`ExifTool could not reopen the generated output (${result.error.code})`,
			);
		}

		if (result.value.length !== 1) {
			return verificationFailure("Expected exactly one ExifTool metadata record");
		}

		const record = result.value[0]!;
		if (typeof record.FileType !== "string" || record.FileType.length === 0) {
			return verificationFailure("Generated output has no recognized file type");
		}

		if (record.Error !== undefined) {
			return verificationFailure("ExifTool reported an error for the generated output");
		}

		return { ok: true, value: undefined };
	}
}

function verificationFailure(
	detail: string,
): Result<void, OutputVerificationError> {
	return { ok: false, error: { code: "output-verification-failed", detail } };
}
