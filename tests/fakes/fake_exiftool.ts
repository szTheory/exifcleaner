import type { ExifToolPort } from "../../src/application/exiftool_port";
import type { Result } from "../../src/common/result";
import type { ExifError } from "../../src/domain/exif/exif_errors";

export class FakeExifTool implements ExifToolPort {
	calls: Array<{ method: string; args: unknown[] }> = [];

	readResult: Result<Record<string, unknown>[], ExifError> = {
		ok: true,
		value: [{ FileName: "test.jpg" }],
	};

	removeResult: Result<void, ExifError> = {
		ok: true,
		value: undefined,
	};

	async open(): Promise<number> {
		this.calls.push({ method: "open", args: [] });
		return 12345;
	}

	async close(): Promise<Result<void>> {
		this.calls.push({ method: "close", args: [] });
		return { ok: true, value: undefined };
	}

	async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<Record<string, unknown>[], ExifError>> {
		this.calls.push({ method: "readMetadata", args: [filePath, args] });
		return this.readResult;
	}

	async removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<void, ExifError>> {
		this.calls.push({ method: "removeMetadata", args: [filePath, args] });
		return this.removeResult;
	}
}
