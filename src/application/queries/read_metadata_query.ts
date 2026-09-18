import type { ExifToolPort } from "../exiftool_port";
import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import { cleanExifData } from "../../domain";
import { classifyInspectionDiagnostics } from "../../infrastructure/exiftool/exiftool_diagnostics";

export class ReadMetadataQuery {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		filePath,
	}: {
		filePath: string;
	}): Promise<Result<Record<string, unknown>, ExifError>> {
		// G1 identifies the physical metadata family (System/File/JFIF/EXIF/etc.)
		// while G2 supplies the user-facing category. cleanExifData uses both to
		// discard structural fields, then normalizes retained keys back to G2:Tag.
		//
		// G4 (family 4, "instance number") is required, not cosmetic: measured against
		// the bundled binary (48-D06-SETTLEMENT.md), ExifTool's -json output suppresses
		// duplicate same-name JSON entries, so a genuinely co-occurring ExifTool-group
		// Error/Warning pair can silently collapse onto one JSON key -- which key survives
		// is generation-order-dependent, not something classifyInspectionDiagnostics could
		// ever recover from a JSON object it never received. -G4 disambiguates every
		// duplicate (ExifTool-group or not) with a "CopyN" segment; cleanExifData's
		// normalizeMetadataKey strips that segment again so ordinary displayed tag names
		// are unaffected -- a single call, no added per-file round trip.
		const args = ["-G1:2:4"];
		const result = await this.exiftool.readMetadata({ filePath, args });

		if (!result.ok) {
			return result;
		}

		const firstItem = result.value[0];
		if (firstItem === undefined) {
			return { ok: true, value: {} };
		}
		const verdict = classifyInspectionDiagnostics({
			record: firstItem,
			purpose: "display",
		});
		if (verdict.fatal) {
			return {
				ok: false,
				error: {
					code: "exiftool-error",
					detail: verdict.detail,
				},
			};
		}

		return { ok: true, value: cleanExifData({ raw: firstItem }) };
	}
}
