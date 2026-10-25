import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../e2e/fixtures",
);

// Single source of the identifying HEIC/AVIF seed (63-05, D-13). Identifying variants are never
// committed; every test, smoke case and script that needs one seeds a temp copy of a committed
// fixture with these arguments. Orientation 6 is written with `#` so the numeric value is used.
export const HEIF_SEED_ARGS: readonly string[] = [
	"-Artist=ZZ63-ARTIST",
	"-Copyright=ZZ63-COPYRIGHT",
	"-Make=ZZ63-MAKE",
	"-Model=ZZ63-MODEL",
	"-GPSLatitude=37.7749",
	"-GPSLatitudeRef=N",
	"-GPSLongitude=122.4194",
	"-GPSLongitudeRef=W",
	"-XMP-dc:Creator=ZZ63-CREATOR",
	"-DateTimeOriginal=2020:01:02 03:04:05",
	"-Orientation#=6",
	"-IFD0:XResolution=300",
	"-IFD0:YResolution=300",
	"-IFD0:ResolutionUnit=inches",
];

// Seeds a copy the caller already placed in a temp directory. Refuses the committed fixtures
// directory so a seeded variant can never be written back over (or next to) a committed fixture.
export function seedHeifCopy({
	exiftoolPath,
	sourcePath,
}: {
	exiftoolPath: string;
	sourcePath: string;
}): void {
	const resolved = fs.realpathSync(path.resolve(sourcePath));
	const fixturesReal = fs.realpathSync(FIXTURES_DIR);
	if (
		resolved === fixturesReal ||
		resolved.startsWith(fixturesReal + path.sep)
	) {
		throw new Error(
			`seedHeifCopy refuses to modify files inside ${fixturesReal}: ${resolved}`,
		);
	}
	execFileSync(exiftoolPath, [
		...HEIF_SEED_ARGS,
		"-overwrite_original",
		sourcePath,
	]);
}
