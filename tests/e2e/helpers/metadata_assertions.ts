import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../../.resources/nix/bin/exiftool");

// Tags that ExifTool always returns (computed / structural, not user EXIF data)
const COMPUTED_TAG_PREFIXES = ["File", "Source", "ExifTool"];
const COMPUTED_TAG_NAMES = new Set(["Directory", "FileName"]);
const STRUCTURAL_TAG_NAMES = new Set([
	"MIMEType",
	"ImageWidth",
	"ImageHeight",
	"ImageSize",
	"Megapixels",
	"BitsPerSample",
	"ColorComponents",
	"EncodingProcess",
	"YCbCrSubSampling",
	"JFIFVersion",
]);

export async function readMetadataTags(
	filePath: string,
): Promise<Record<string, unknown>> {
	const { stdout } = await execFileAsync(EXIFTOOL_PATH, ["-json", filePath]);
	const parsed = JSON.parse(stdout) as Record<string, unknown>[];
	const first = parsed[0];
	if (first === undefined) {
		return {};
	}
	return first;
}

export async function assertMetadataStripped(filePath: string): Promise<void> {
	const tags = await readMetadataTags(filePath);
	const userExifKeys = Object.keys(tags).filter((key) => {
		if (COMPUTED_TAG_NAMES.has(key)) return false;
		if (STRUCTURAL_TAG_NAMES.has(key)) return false;
		for (const prefix of COMPUTED_TAG_PREFIXES) {
			if (key.startsWith(prefix)) return false;
		}
		return true;
	});
	expect(
		userExifKeys,
		`Expected no user EXIF tags but found: ${userExifKeys.join(", ")}`,
	).toHaveLength(0);
}

export async function assertHasMetadata(
	filePath: string,
	tagName: string,
): Promise<void> {
	const tags = await readMetadataTags(filePath);
	expect(tags).toHaveProperty(tagName);
}
