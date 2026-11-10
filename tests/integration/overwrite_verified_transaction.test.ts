// Phase 69-12 (OVR-01; D-08, D-09, D-23): an OVERWRITE of the seven native image extensions
// (.jpg .jpeg .png .webp .heic .heif .avif) runs through the staged OutputTransaction with the
// real stack and the real bundled ExifTool, composed exactly the way exif_handlers.ts composes it:
//   outputMode "overwrite" -> requiresVerifiedWrite -> commitPath = the source, a hidden stage
//   beside it, copyModeLeakCheck demand from copyModeLeakCheckDemandOf.
// Two write routes are exercised for every extension:
//   native    HybridMetadataEngine with the real NativeMetadataAdapter (native writes the stage
//             whenever it admits the request; a pre-write decline falls back to ExifTool)
//   exiftool  the ExifToolAdapter wired directly (what runs when native declines before writing;
//             hybrid_metadata_engine.ts admits native for these formats regardless of
//             preserveTimestamps, so the fallback is forced by wiring, never by a setting, A7)
// Reopen verification and the leak check run on EVERY output, including the ExifTool route
// (writtenBy "exiftool"). Whole-directory assertions throughout: the directory afterwards is the
// source name plus an unrelated sibling, no stage, no _exiftool_tmp; on every failure the source
// sha256 and the directory equal the pre-state.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { itOnPosixUser } from "../helpers/posix_host";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import {
	copyModeLeakCheckDemandOf,
	requiresVerifiedWrite,
} from "../../src/domain/files/file_types";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { seedHeifCopy } from "../helpers/heif_seed";
import { realTransactionFileDependencies } from "../helpers/transaction_deps";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

type Settings = {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
};

const DEFAULT_PRESERVATION: Settings = {
	preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
	preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
	preserveResolution: DEFAULT_SETTINGS.preserveResolution,
	preserveTimestamps: DEFAULT_SETTINGS.preserveTimestamps,
};
const ALL_OFF: Settings = {
	preserveOrientation: false,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: false,
};

type Route = "native" | "exiftool";
const ROUTES: readonly Route[] = ["native", "exiftool"];

const SENTINEL = "ZZLEAK-69-OVR";
const SIBLING = "unrelated-sibling.txt";

type Seed = "exiftool" | "heif" | "none";

interface Case {
	// The name inside the temporary directory (the extension decides the routing).
	readonly name: string;
	readonly fixture: string;
	readonly seed: Seed;
}

// The seven extensions, each from a committed fixture. Identifying tags are planted at run time on
// the temporary copy (never committed, D-13) so a strip always has something to remove.
const SEVEN: readonly Case[] = [
	{ name: "sample.jpg", fixture: "sample.jpg", seed: "exiftool" },
	{ name: "sample.jpeg", fixture: "sample.jpg", seed: "exiftool" },
	{ name: "sample.png", fixture: "sample.png", seed: "exiftool" },
	{ name: "sample.webp", fixture: "sample.webp", seed: "exiftool" },
	{ name: "sample.heic", fixture: "sample-sips-icc.heic", seed: "heif" },
	{ name: "sample.heif", fixture: "sample-sips-icc.heic", seed: "heif" },
	{ name: "sample.avif", fixture: "sample-sips-icc.avif", seed: "heif" },
];

// Colour files (D-23 precondition): the 4:2:0 progressive and 4:4:4 JPEGs of 69-02 and the ICC
// bearing P3 JPEG and PNG of 69-03 pass the verified overwrite on both routes, which holds only
// because the G1 allowlist fix (File:YCbCrSubSampling and the measured ICC names) landed first.
const COLOUR: readonly Case[] = [
	{
		name: "color_420_progressive.jpg",
		fixture: "color_420_progressive.jpg",
		seed: "none",
	},
	{ name: "color_444.jpg", fixture: "color_444.jpg", seed: "none" },
	{ name: "color_icc_p3.jpg", fixture: "color_icc_p3.jpg", seed: "none" },
	{ name: "color_icc_p3.png", fixture: "color_icc_p3.png", seed: "none" },
];

const IDENTIFYING_GROUP =
	/^(XMP|XMP-[^:]+|ExifIFD|GPS|IFD1|MakerNotes|Photoshop|IPTC):/;
const IDENTIFYING_TAGS = new Set([
	"IFD0:Make",
	"IFD0:Model",
	"IFD0:Artist",
	"IFD0:Software",
	"IFD0:Copyright",
	"IFD0:ImageDescription",
	"IFD0:DateTime",
	"RIFF:Comment",
	"RIFF:Software",
	"PNG:Comment",
	"Composite:GPSLatitude",
	"Composite:GPSLongitude",
	"Composite:GPSPosition",
]);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Reopen exactly as the verification does (-j -G1:2:4), folding keys to Group1:Tag and dropping the
// exempt System group. Names only.
function reopenKeys(filePath: string): string[] {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	});
	const record = (JSON.parse(raw.toString()) as Record<string, unknown>[])[0];
	if (record === undefined) throw new Error("no record");
	const keys: string[] = [];
	for (const key of Object.keys(record)) {
		if (key === "SourceFile") continue;
		const parts = key.split(":").filter((part) => !/^Copy\d+$/.test(part));
		const group1 = parts[0];
		const tag = parts.at(-1);
		if (group1 === undefined || tag === undefined || group1 === "System") {
			continue;
		}
		keys.push(`${group1}:${tag}`);
	}
	return [...new Set(keys)].sort();
}

function identifyingKeysOf(keys: readonly string[]): string[] {
	return keys.filter(
		(key) => IDENTIFYING_GROUP.test(key) || IDENTIFYING_TAGS.has(key),
	);
}

function plantExifToolTags(filePath: string): void {
	execFileSync(EXIFTOOL_PATH, [
		"-overwrite_original",
		"-Make=ZZ69-MAKE",
		"-Artist=ZZ69-ARTIST",
		"-GPSLatitude=37.7749",
		"-GPSLatitudeRef=N",
		"-GPSLongitude=122.4194",
		"-GPSLongitudeRef=W",
		"-XMP-dc:Creator=ZZ69-CREATOR",
		filePath,
	]);
}

function injectLeak(filePath: string): void {
	execFileSync(EXIFTOOL_PATH, [
		"-overwrite_original",
		`-XMP-dc:Creator=${SENTINEL}`,
		filePath,
	]);
}

const tally = {
	runs: 0,
	nativeRoutePass: 0,
	exiftoolRoutePass: 0,
	refusedLeak: 0,
	refusedContent: 0,
};

describe("69-12: overwrite of the seven native image extensions on the verified staged transaction (OVR-01)", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const temporaryDirs: string[] = [];

	beforeAll(async () => {
		await exiftoolProcess.open();
	});

	afterAll(async () => {
		await exiftoolProcess.close();
		for (const dir of temporaryDirs.splice(0)) {
			try {
				fs.chmodSync(dir, 0o755);
			} catch {
				// already gone
			}
			fs.rmSync(dir, { recursive: true, force: true });
		}
		console.log(
			`OVERWRITE-VERIFIED: runs=${tally.runs} native-route-pass=${tally.nativeRoutePass} exiftool-route-pass=${tally.exiftoolRoutePass} refused-leak=${tally.refusedLeak} refused-content=${tally.refusedContent}`,
		);
	});

	function freshDir(): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overwrite-verified-"));
		temporaryDirs.push(dir);
		fs.writeFileSync(path.join(dir, SIBLING), "keep me");
		return dir;
	}

	function place({ dir, testCase }: { dir: string; testCase: Case }): string {
		const source = path.join(dir, testCase.name);
		fs.copyFileSync(path.join(FIXTURES, testCase.fixture), source);
		if (testCase.seed === "exiftool") plantExifToolTags(source);
		if (testCase.seed === "heif") {
			seedHeifCopy({ exiftoolPath: EXIFTOOL_PATH, sourcePath: source });
		}
		return source;
	}

	function buildStack({
		route,
		injectAfterWrite = false,
	}: {
		route: Route;
		injectAfterWrite?: boolean;
	}) {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const realStrip = new StripMetadataCommand({
			metadataEngine: route === "native" ? hybrid : exiftool,
		});
		const stripMetadata = injectAfterWrite
			? {
					execute: async (
						request: Parameters<StripMetadataCommand["execute"]>[0],
					) => {
						const result = await realStrip.execute(request);
						if (result.ok) injectLeak(request.outputPath as string);
						return result;
					},
				}
			: realStrip;
		// Reopen goes through ExifTool whichever engine wrote the stage (hybrid.inspect delegates).
		const query = new VerifyGeneratedOutputQuery({ metadataEngine: hybrid });
		const verifySpy = vi.spyOn(query, "execute");
		const transaction = new OutputTransaction({
			stripMetadata,
			verifyGeneratedOutput: query,
			...realTransactionFileDependencies(),
		});
		return { transaction, exiftoolWrite, nativeWrite, verifySpy };
	}

	// Composes the request the way exif_handlers.ts does for saveAsCopy false.
	async function overwrite({
		source,
		route,
		settings,
		injectAfterWrite = false,
	}: {
		source: string;
		route: Route;
		settings: Settings;
		injectAfterWrite?: boolean;
	}) {
		const dir = path.dirname(source);
		const stack = buildStack({ route, injectAfterWrite });
		expect(
			requiresVerifiedWrite({ filename: source, outputMode: "overwrite" }),
		).toBe(true);
		const demand = copyModeLeakCheckDemandOf({
			filename: source,
			outputMode: "overwrite",
		});
		expect(demand).toBe("required");
		const parsed = path.parse(source);
		const generatedPath = path.join(
			dir,
			`.${parsed.name}.exifcleaner-stage-${route}${parsed.ext}`,
		);
		const before = snapshotDir(dir);
		const outcome = await stack.transaction.execute({
			filePath: source,
			generatedPath,
			commitPath: source,
			...settings,
			copyModeLeakCheck: {
				demand: demand ?? "required",
				preserveOrientation: settings.preserveOrientation,
				preserveColorProfile: settings.preserveColorProfile,
				preserveResolution: settings.preserveResolution,
			},
		});
		const after = snapshotDir(dir);
		tally.runs += 1;
		return { stack, outcome, before, after, generatedPath };
	}

	function expectNoResidue(dir: string, expected: readonly string[]): void {
		expect(fs.readdirSync(dir).sort()).toEqual([...expected].sort());
	}

	describe.each(ROUTES)(
		"route %s: seven extensions replace in place",
		(route) => {
			const MATRIX = SEVEN.flatMap((testCase) =>
				(
					[
						["DEFAULT_SETTINGS preservation", DEFAULT_PRESERVATION],
						["every preserve option off", ALL_OFF],
					] as const
				).map(([label, settings]) => ({ testCase, label, settings })),
			);

			it.each(MATRIX)(
				"$testCase.name under $label: staged, verified and leak-checked, replaced in place with the identifying tags gone, directory exact",
				async ({ testCase, settings }) => {
					const dir = freshDir();
					const source = place({ dir, testCase });
					const sourceIdentifying = identifyingKeysOf(reopenKeys(source));
					// Non-vacuity: the source really carries identifying tags before the strip.
					expect(sourceIdentifying.length).toBeGreaterThan(0);
					const sourceDigest = sha256(source);

					const ran = await overwrite({ source, route, settings });

					// The transaction reports which engine wrote the stage (69-14, D-17).
					expect(ran.outcome).toEqual({
						ok: true,
						value: { outputPath: source, writtenBy: route },
					});
					// The engine that wrote the stage is the intended one, and only that one.
					if (route === "native") {
						expect(ran.stack.nativeWrite).toHaveBeenCalledOnce();
						expect(ran.stack.exiftoolWrite).not.toHaveBeenCalled();
						tally.nativeRoutePass += 1;
					} else {
						expect(ran.stack.nativeWrite).not.toHaveBeenCalled();
						expect(ran.stack.exiftoolWrite).toHaveBeenCalledOnce();
						tally.exiftoolRoutePass += 1;
					}
					// The reopen and leak check really ran, with the provenance of that write.
					expect(ran.stack.verifySpy).toHaveBeenCalledOnce();
					expect(ran.stack.verifySpy.mock.calls[0]?.[0]).toMatchObject({
						generatedPath: ran.generatedPath,
						copyModeLeakCheck: {
							demand: "required",
							writtenBy: route === "native" ? "native" : "exiftool",
						},
					});
					// Replaced in place: the cleaned bytes differ and carry no identifying keys.
					expect(sha256(source)).not.toBe(sourceDigest);
					expect(identifyingKeysOf(reopenKeys(source))).toEqual([]);
					assertDirEffect(ran.before, ran.after, {
						modified: [testCase.name],
						unchanged: [SIBLING],
						added: [],
						removed: [],
					});
					// No stage, no ExifTool temp file.
					expectNoResidue(dir, [testCase.name, SIBLING]);
				},
			);

			it.each(COLOUR)(
				"$name (colour, D-23 precondition) overwrites through the verified transaction",
				async (testCase) => {
					const dir = freshDir();
					const source = place({ dir, testCase });
					const sourceDigest = sha256(source);

					const ran = await overwrite({
						source,
						route,
						settings: DEFAULT_PRESERVATION,
					});

					// Native is asked first and may decline before writing (the router then falls
					// back to ExifTool), so the reported writer is derived from the observed calls.
					const writer =
						route === "native" &&
						ran.stack.exiftoolWrite.mock.calls.length === 0
							? "native"
							: "exiftool";
					expect(ran.outcome).toEqual({
						ok: true,
						value: { outputPath: source, writtenBy: writer },
					});
					if (route === "native") {
						// Native is asked first; an ICC-bearing file may be declined before any write
						// and the router then falls back to ExifTool. Either route is a pass; which one
						// happened is measured and printed, never assumed.
						expect(ran.stack.nativeWrite).toHaveBeenCalledOnce();
						const fallbackWrites = ran.stack.exiftoolWrite.mock.calls.length;
						expect([0, 1]).toContain(fallbackWrites);
						expect(ran.stack.verifySpy.mock.calls[0]?.[0]).toMatchObject({
							copyModeLeakCheck: {
								writtenBy: fallbackWrites === 0 ? "native" : "exiftool",
							},
						});
						console.log(
							`MEASURE: ${process.platform} overwrite-colour id=${testCase.name} route=native writer=${fallbackWrites === 0 ? "native" : "exiftool-after-decline"}`,
						);
					} else {
						expect(ran.stack.exiftoolWrite).toHaveBeenCalledOnce();
					}
					expect(ran.stack.verifySpy).toHaveBeenCalledOnce();
					expect(sha256(source)).not.toBe(sourceDigest);
					expect(identifyingKeysOf(reopenKeys(source))).toEqual([]);
					assertDirEffect(ran.before, ran.after, {
						modified: [testCase.name],
						unchanged: [SIBLING],
						added: [],
						removed: [],
					});
					expectNoResidue(dir, [testCase.name, SIBLING]);
				},
			);

			it.each(SEVEN)(
				"$name: a leak written onto the stage after the real write fails closed, the stage is removed, the source and the directory equal the pre-state",
				async (testCase) => {
					const dir = freshDir();
					const source = place({ dir, testCase });
					const sourceDigest = sha256(source);

					const ran = await overwrite({
						source,
						route,
						settings: DEFAULT_PRESERVATION,
						injectAfterWrite: true,
					});

					expect(ran.outcome.ok).toBe(false);
					if (ran.outcome.ok) return;
					expect(ran.outcome.error).toMatchObject({
						code: "verification-failed",
						verificationCode: "output-metadata-leak",
					});
					const error = ran.outcome.error;
					if (error.code !== "verification-failed") return;
					// Tag NAMES only, never the planted value.
					expect(error.diagnostic).toContain("XMP-dc:Creator");
					expect(JSON.stringify(ran.outcome)).not.toContain(SENTINEL);
					expect(sha256(source)).toBe(sourceDigest);
					expect(fs.existsSync(ran.generatedPath)).toBe(false);
					expect(fs.readFileSync(path.join(dir, SIBLING), "utf8")).toBe(
						"keep me",
					);
					assertDirEffect(ran.before, ran.after, {
						unchanged: [testCase.name, SIBLING],
						added: [],
						modified: [],
						removed: [],
					});
					expectNoResidue(dir, [testCase.name, SIBLING]);
					tally.refusedLeak += 1;
				},
			);

			it("GIF bytes named .webp: the writer refuses the content, the overwrite fails closed (write-failed) and the source is kept", async () => {
				const dir = freshDir();
				const source = path.join(dir, "not-really.webp");
				fs.copyFileSync(path.join(FIXTURES, "GIF.gif"), source);
				const sourceDigest = sha256(source);

				const ran = await overwrite({
					source,
					route,
					settings: DEFAULT_PRESERVATION,
				});

				// ExifTool itself reports "Not a valid WEBP (looks more like a GIF)"; native declines
				// at admission and the fallback meets the same refusal.
				expect(ran.outcome).toEqual({
					ok: false,
					error: { code: "write-failed" },
				});
				expect(ran.stack.verifySpy).not.toHaveBeenCalled();
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(ran.before, ran.after, {
					unchanged: ["not-really.webp", SIBLING],
					added: [],
					modified: [],
					removed: [],
				});
				expectNoResidue(dir, ["not-really.webp", SIBLING]);
				tally.refusedContent += 1;
			});
		},
	);

	describe("content with no leak allowlist behind an image extension (D-09)", () => {
		// No real writer accepts GIF content under a .webp name, so a writer double produces the
		// output a misbehaving or fallback engine could: GIF bytes at the stage. The reopen still
		// runs through the real ExifTool and the real verifier, with the demand the handler computes.
		async function runWithGifWriter({
			demand,
		}: {
			demand: "required" | "when-allowlisted";
		}) {
			const dir = freshDir();
			const source = path.join(dir, "not-really.webp");
			fs.copyFileSync(path.join(FIXTURES, "sample.webp"), source);
			const sourceDigest = sha256(source);
			const hybrid = new HybridMetadataEngine({
				exiftool: new ExifToolAdapter({ process: exiftoolProcess }),
				native: new NativeMetadataAdapter(),
			});
			const gifWriter = {
				execute: async (
					request: Parameters<StripMetadataCommand["execute"]>[0],
				) => {
					fs.copyFileSync(
						path.join(FIXTURES, "GIF.gif"),
						request.outputPath as string,
					);
					return {
						ok: true as const,
						value: { tagsRemoved: 0, writtenBy: "exiftool" as const },
					};
				},
			};
			const transaction = new OutputTransaction({
				stripMetadata: gifWriter,
				verifyGeneratedOutput: new VerifyGeneratedOutputQuery({
					metadataEngine: hybrid,
				}),
				...realTransactionFileDependencies(),
			});
			const generatedPath = path.join(
				dir,
				".not-really.exifcleaner-stage-gif.webp",
			);
			const before = snapshotDir(dir);
			const outcome = await transaction.execute({
				filePath: source,
				generatedPath,
				commitPath: source,
				...DEFAULT_PRESERVATION,
				copyModeLeakCheck: {
					demand,
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				},
			});
			return {
				dir,
				source,
				sourceDigest,
				outcome,
				before,
				after: snapshotDir(dir),
				generatedPath,
			};
		}

		it("the demand the handler computes for an overwrite (required) refuses GIF output, keeps the source and leaves nothing behind", async () => {
			expect(
				copyModeLeakCheckDemandOf({
					filename: "not-really.webp",
					outputMode: "overwrite",
				}),
			).toBe("required");
			const ran = await runWithGifWriter({ demand: "required" });

			expect(ran.outcome).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic:
						"Copy-mode leak check has no permitted-tag set for this file type (GIF)",
				},
			});
			expect(sha256(ran.source)).toBe(ran.sourceDigest);
			expect(fs.existsSync(ran.generatedPath)).toBe(false);
			assertDirEffect(ran.before, ran.after, {
				unchanged: ["not-really.webp", SIBLING],
				added: [],
				modified: [],
				removed: [],
			});
			expectNoResidue(ran.dir, ["not-really.webp", SIBLING]);
			tally.refusedContent += 1;
		});

		it("control: the weaker when-allowlisted demand would publish the same GIF bytes over the source, which is why overwrite of these extensions demands required", async () => {
			const ran = await runWithGifWriter({ demand: "when-allowlisted" });

			expect(ran.outcome).toEqual({
				ok: true,
				value: { outputPath: ran.source, writtenBy: "exiftool" },
			});
			expect(sha256(ran.source)).not.toBe(ran.sourceDigest);
		});
	});

	describe("TIFF and media overwrite inherit the transaction (review N6)", () => {
		// Same composition as the handler: TIFF and media are verified in overwrite mode with no
		// leak demand, and ExifTool writes them (native does not handle either).
		async function overwriteVerifyOnly({ source }: { source: string }) {
			const dir = path.dirname(source);
			const stack = buildStack({ route: "native" });
			expect(
				requiresVerifiedWrite({ filename: source, outputMode: "overwrite" }),
			).toBe(true);
			expect(
				copyModeLeakCheckDemandOf({
					filename: source,
					outputMode: "overwrite",
				}),
			).toBeUndefined();
			const parsed = path.parse(source);
			const generatedPath = path.join(
				dir,
				`.${parsed.name}.exifcleaner-stage-verify-only${parsed.ext}`,
			);
			const before = snapshotDir(dir);
			const outcome = await stack.transaction.execute({
				filePath: source,
				generatedPath,
				commitPath: source,
				...DEFAULT_PRESERVATION,
			});
			return { stack, outcome, before, after: snapshotDir(dir) };
		}

		it.each([
			{ name: "sample.tif", fixture: "sample.tif" },
			{ name: "sample.mp4", fixture: "sample.mp4" },
		])(
			"$name overwrite commits through the same transaction",
			async ({ name, fixture }) => {
				const dir = freshDir();
				const source = path.join(dir, name);
				fs.copyFileSync(path.join(FIXTURES, fixture), source);

				const ran = await overwriteVerifyOnly({ source });

				expect(ran.outcome).toEqual({
					ok: true,
					value: { outputPath: source, writtenBy: "exiftool" },
				});
				expect(ran.stack.exiftoolWrite).toHaveBeenCalledOnce();
				expect(ran.stack.nativeWrite).not.toHaveBeenCalled();
				assertDirEffect(ran.before, ran.after, {
					modified: [name],
					unchanged: [SIBLING],
					added: [],
					removed: [],
				});
				expectNoResidue(dir, [name, SIBLING]);
			},
		);

		itOnPosixUser(
			"a POSIX 0444 TIFF keeps its mode after the staged overwrite",
			async () => {
				const dir = freshDir();
				const source = path.join(dir, "sample.tif");
				fs.copyFileSync(path.join(FIXTURES, "sample.tif"), source);
				fs.chmodSync(source, 0o444);

				const ran = await overwriteVerifyOnly({ source });

				expect(ran.outcome).toEqual({
					ok: true,
					value: { outputPath: source, writtenBy: "exiftool" },
				});
				expect(fs.statSync(source).mode & 0o7777).toBe(0o444);
				assertDirEffect(ran.before, ran.after, {
					modified: ["sample.tif"],
					unchanged: [SIBLING],
					added: [],
					removed: [],
				});
				expectNoResidue(dir, ["sample.tif", SIBLING]);
			},
		);
	});
});
