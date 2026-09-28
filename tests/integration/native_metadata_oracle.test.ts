import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// 58-06 (D-21): per-format oracle table replacing the former WebP-only literals. Each
// entry names its fixture, the FileType the reopened output must report, the keys the
// fixture carries before processing (checked for presence, unconditionally removed
// regardless of preservation settings), and the optional orientation/colorProfile keys
// that toggle with preservation. All display-metadata keys are the G2:Tag form
// cleanExifData/normalizeMetadataKey produce (Group1 is dropped).
type OracleFixtureEntry = {
	readonly fixture: string;
	readonly fileTypePattern: RegExp;
	// Keys present on the fixture before processing that are always removed, independent
	// of the preservation flags under test (identifying metadata, never opt-in).
	readonly alwaysRemovedKeys: readonly string[];
	// Orientation key/value this fixture carries, when it carries one -- toggles with
	// preserveOrientation. Undefined means this fixture has no Orientation tag at all.
	readonly orientation?: { readonly key: string; readonly value: string };
	// Color profile key/value this fixture carries, when it carries one -- toggles with
	// preserveColorProfile.
	readonly colorProfile?: { readonly key: string; readonly value: string };
};

const ORACLE_FIXTURES: readonly OracleFixtureEntry[] = [
	{
		fixture: "sample.webp",
		fileTypePattern: /WEBP/u,
		alwaysRemovedKeys: ["Camera:Make", "Author:Artist"],
		orientation: { key: "Image:Orientation", value: "Rotate 90 CW" },
		colorProfile: {
			key: "Image:ProfileDescription",
			value: "Nikon Adobe RGB 4.0.0.3000",
		},
	},
	{
		fixture: "orientation.jpg",
		fileTypePattern: /JPEG/u,
		alwaysRemovedKeys: [],
		orientation: { key: "Image:Orientation", value: "Rotate 90 CW" },
	},
	{
		fixture: "orientation.png",
		fileTypePattern: /PNG/u,
		alwaysRemovedKeys: ["Author:Author", "Author:Copyright"],
		orientation: { key: "Image:Orientation", value: "Rotate 90 CW" },
	},
	{
		fixture: "sample.jpg",
		fileTypePattern: /JPEG/u,
		alwaysRemovedKeys: [
			"Camera:Make",
			"Camera:Model",
			"Author:Artist",
			"Author:Copyright",
			"Location:GPSLatitude",
			"Location:GPSLongitude",
		],
	},
];

describe("native metadata oracle: WebP, JPEG and PNG against an independent ExifTool oracle", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function makeTempDir(prefix: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		temporaryDirs.push(dir);
		return dir;
	}

	describe.each(ORACLE_FIXTURES)("$fixture", (entry) => {
		async function runPreservationCase({
			preserveAll,
		}: {
			preserveAll: boolean;
		}): Promise<void> {
			const dir = makeTempDir("native-oracle-");
			const extension = path.extname(entry.fixture);
			const source = path.join(dir, entry.fixture);
			const destination = path.join(
				dir,
				`${path.basename(entry.fixture, extension)}-cleaned${extension}`,
			);
			fs.copyFileSync(path.join(FIXTURES_DIR, entry.fixture), source);
			const fixtureTimestamp = new Date("2020-01-02T03:04:05.000Z");
			fs.utimesSync(source, fixtureTimestamp, fixtureTimestamp);
			const sourceDigest = sha256(source);
			const sourceStats = fs.statSync(source);
			const beforeDir = snapshotDir(dir);
			const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const exiftool = new ExifToolAdapter({ process });
			const native = new NativeMetadataAdapter();
			const hybrid = new HybridMetadataEngine({ exiftool, native });
			const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
			const nativeWrite = vi.spyOn(native, "sanitize");

			await process.open();
			try {
				const before = await exiftool.inspect({ source, purpose: "display" });
				expect(before).toMatchObject({ ok: true });
				if (!before.ok) return;
				for (const key of entry.alwaysRemovedKeys) {
					expect(before.value.metadata).toHaveProperty(key);
				}
				if (entry.orientation) {
					expect(before.value.metadata).toHaveProperty(
						entry.orientation.key,
						entry.orientation.value,
					);
				}
				if (entry.colorProfile) {
					expect(before.value.metadata).toHaveProperty(
						entry.colorProfile.key,
						entry.colorProfile.value,
					);
				}

				const result = await hybrid.sanitize({
					source,
					destination,
					outputMode: "copy",
					preserveOrientation: preserveAll,
					preserveColorProfile: preserveAll,
					preserveResolution: false,
					preserveTimestamps: preserveAll,
				});

				expect(result).toEqual({ ok: true, value: undefined });
				expect(nativeWrite).toHaveBeenCalledOnce();
				expect(exiftoolWrite).not.toHaveBeenCalled();
				expect(destination).not.toBe(source);
				expect(fs.existsSync(destination)).toBe(true);
				expect(sha256(source)).toBe(sourceDigest);
				expect(fs.statSync(source)).toMatchObject({
					mtimeMs: sourceStats.mtimeMs,
				});
				assertDirEffect(beforeDir, snapshotDir(dir), {
					unchanged: [entry.fixture],
					added: [path.basename(destination)],
					modified: [],
					removed: [],
				});

				const outputVerification = await exiftool.inspect({
					source: destination,
					purpose: "output-verification",
				});
				expect(outputVerification).toMatchObject({
					ok: true,
					value: { recordCount: 1, verification: { error: undefined } },
				});
				if (!outputVerification.ok) return;
				expect(String(outputVerification.value.verification.fileType)).toMatch(
					entry.fileTypePattern,
				);

				const after = await exiftool.inspect({
					source: destination,
					purpose: "display",
				});
				expect(after).toMatchObject({ ok: true });
				if (!after.ok) return;
				for (const key of entry.alwaysRemovedKeys) {
					expect(after.value.metadata).not.toHaveProperty(key);
				}
				if (entry.orientation) {
					if (preserveAll) {
						expect(after.value.metadata).toHaveProperty(
							entry.orientation.key,
							entry.orientation.value,
						);
					} else {
						expect(after.value.metadata).not.toHaveProperty(
							entry.orientation.key,
						);
					}
				}
				if (entry.colorProfile) {
					if (preserveAll) {
						expect(after.value.metadata).toHaveProperty(
							entry.colorProfile.key,
							entry.colorProfile.value,
						);
					} else {
						expect(after.value.metadata).not.toHaveProperty(
							entry.colorProfile.key,
						);
					}
				}
				const destinationTimestamp = fs.statSync(destination).mtimeMs;
				if (preserveAll) {
					expect(destinationTimestamp).toBeCloseTo(sourceStats.mtimeMs, 0);
				} else {
					expect(destinationTimestamp).not.toBeCloseTo(sourceStats.mtimeMs, 0);
				}
			} finally {
				await process.close();
			}
		}

		// 58-07's native orientation mutation gate greps this exact title for
		// orientation.jpg and orientation.png -- keep it byte-identical.
		it(`${entry.fixture} preserves requested orientation natively`, async () => {
			await runPreservationCase({ preserveAll: true });
		});

		it(`${entry.fixture} removes optional orientation natively when preservation is disabled`, async () => {
			await runPreservationCase({ preserveAll: false });
		});
	});

	// 58-06 (D-21) negative fallback row: proves node's XMP-only-orientation admission
	// decline falls back to ExifTool safely end to end, through the real HybridMetadataEngine.
	it("orientation-xmp-only.png falls back to ExifTool once when node declines XMP-only orientation", async () => {
		const dir = makeTempDir("native-oracle-fallback-");
		const source = path.join(dir, "orientation-xmp-only.png");
		const destination = path.join(dir, "orientation-xmp-only-cleaned.png");
		fs.copyFileSync(
			path.join(FIXTURES_DIR, "orientation-xmp-only.png"),
			source,
		);
		const sourceDigest = sha256(source);
		const beforeDir = snapshotDir(dir);
		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination,
				outputMode: "copy",
				preserveOrientation: true,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			});

			expect(result).toEqual({ ok: true, value: undefined });
			expect(nativeWrite).toHaveBeenCalledOnce();
			expect(exiftoolWrite).toHaveBeenCalledOnce();

			// Safe: nativeWrite was asserted toHaveBeenCalledOnce above, so its first
			// (only) result exists.
			const nativeResult = await nativeWrite.mock.results[0]!.value;
			expect(nativeResult).toMatchObject({
				ok: false,
				error: { phase: "admission", nativeWrite: "not-started" },
			});

			expect(fs.existsSync(destination)).toBe(true);
			expect(sha256(source)).toBe(sourceDigest);
			assertDirEffect(beforeDir, snapshotDir(dir), {
				unchanged: ["orientation-xmp-only.png"],
				added: ["orientation-xmp-only-cleaned.png"],
				modified: [],
				removed: [],
			});
		} finally {
			await process.close();
		}
	});

	// NC-7 (D-27) whole-directory row: overwrite-mode routing never reaches the
	// native engine, and the on-disk blast radius of an overwrite-mode
	// sanitize is exactly one modified path with nothing added -- asserted via
	// assertDirEffect against a real temp fixture directory, per the
	// nc7_granularity_decision recorded in 47-03-PLAN.md.
	it("NC-7: an overwrite-mode sanitize modifies exactly one path and adds none, with native call count 0 and ExifTool call count 1", async () => {
		const dir = makeTempDir("native-oracle-overwrite-");
		const source = path.join(dir, "sample.webp");
		fs.copyFileSync(path.join(FIXTURES_DIR, "sample.webp"), source);
		const beforeDir = snapshotDir(dir);
		const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const exiftool = new ExifToolAdapter({ process });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");

		await process.open();
		try {
			const result = await hybrid.sanitize({
				source,
				destination: undefined,
				outputMode: "overwrite",
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: false,
				preserveTimestamps: true,
			});

			expect(result).toMatchObject({ ok: true });
			expect(nativeWrite).not.toHaveBeenCalled();
			expect(exiftoolWrite).toHaveBeenCalledOnce();
			assertDirEffect(beforeDir, snapshotDir(dir), {
				modified: ["sample.webp"],
				added: [],
				removed: [],
			});
		} finally {
			await process.close();
		}
	});
});
