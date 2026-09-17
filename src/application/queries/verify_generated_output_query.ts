import type { Result } from "../../common";
import type { ExifToolPort } from "../exiftool_port";
import { classifyInspectionDiagnostics } from "../../infrastructure/exiftool/exiftool_diagnostics";

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
			return verificationFailure(
				"Expected exactly one ExifTool metadata record",
			);
		}

		const record = result.value[0]!;
		if (typeof record.FileType !== "string" || record.FileType.length === 0) {
			return verificationFailure(
				"Generated output has no recognized file type",
			);
		}

		// A second call, not a merged arg set: ExifTool's -G option renames every JSON key
		// to Group:Tag -- including File:FileType, which would break the plain-key guard
		// above (measured: `-G1:2 -File:FileType` still renders the key as
		// "File:Other:FileType", never "FileType"). This scan is the approved scope
		// addition (see 48-01-PLAN.md base_architecture_amendment): this path previously
		// checked only `record.Error`, never ExifTool-group Warning at all.
		//
		// G4 is required, not cosmetic, same as read_metadata_query.ts: measured against
		// the bundled binary (48-D06-SETTLEMENT.md), -G1:2 alone can silently collapse two
		// co-occurring ExifTool-group diagnostics onto one suppressed JSON key.
		const diagnosticResult = await this.exiftool.readMetadata({
			filePath: generatedPath,
			args: ["-G1:2:4"],
		});

		if (!diagnosticResult.ok) {
			return verificationFailure(
				`ExifTool could not reopen the generated output (${diagnosticResult.error.code})`,
			);
		}

		const diagnosticRecord = diagnosticResult.value[0];
		if (diagnosticRecord === undefined) {
			return verificationFailure(
				"Expected exactly one ExifTool metadata record",
			);
		}

		const verdict = classifyInspectionDiagnostics({
			record: diagnosticRecord,
			purpose: "output-verification",
		});
		if (verdict.fatal) {
			return verificationFailure(
				"ExifTool reported an error for the generated output",
			);
		}

		return { ok: true, value: undefined };
	}
}

function verificationFailure(
	detail: string,
): Result<void, OutputVerificationError> {
	return { ok: false, error: { code: "output-verification-failed", detail } };
}
