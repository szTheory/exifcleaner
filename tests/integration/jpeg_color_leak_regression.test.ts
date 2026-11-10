// Phase 69-02 (OVR-01; D-21, D-22, amendment A2): a real colour JPEG saved as a copy through the
// real stack (ExiftoolProcess, ExifToolAdapter, NativeMetadataAdapter, HybridMetadataEngine,
// StripMetadataCommand, VerifyGeneratedOutputQuery, OutputTransaction) must pass verification.
// ExifTool reports File:YCbCrSubSampling on every 3-component JPEG after `-all=`; before the
// allowlist fix that tag failed every colour JPEG copy since 4.5. The old JPEG fixtures are all
// 1-component grayscale, which is why the suite never saw it.
//
// Two engine routes: the default one is native (the real adapter). The ExifTool route is forced
// with a native double that declines before writing (the safe pre-write decline the router
// falls back on), never with preserveTimestamps: every native handler declares
// timestamps: true, so that setting does not force ExifTool (amendment A7).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import type { NativeMetadataPort } from "../../src/infrastructure/metadata/native_metadata_port";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { realTransactionFileDependencies } from "../helpers/transaction_deps";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const DEFAULT_PRESERVATION = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	preserveTimestamps: false,
};

const FIXTURE_CASES = [
	{ fixture: "color_420_progressive.jpg", subSampling: "YCbCr4:2:0 (2 2)" },
	{ fixture: "color_444.jpg", subSampling: "YCbCr4:4:4 (1 1)" },
] as const;

const ROUTES = ["native", "exiftool"] as const;
type Route = (typeof ROUTES)[number];

// Seeded identifying tags (COLOR-PROVENANCE.md); each must be present in the source and absent
// from the copy.
const SEEDED_KEYS = [
	"IFD0:Make",
	"IFD0:Model",
	"IFD0:Artist",
	"GPS:GPSLatitude",
	"GPS:GPSLongitude",
	"XMP-dc:Creator",
] as const;

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readRecord(filePath: string): Record<string, unknown> {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	}).toString();
	return (JSON.parse(raw) as Record<string, unknown>[])[0] ?? {};
}

describe("69-02: colour JPEG copy mode passes verification on both engines", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const temporaryDirs: string[] = [];

	beforeAll(async () => {
		await exiftoolProcess.open();
	});

	afterAll(async () => {
		await exiftoolProcess.close();
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function freshDir(fixture: string): { dir: string; source: string } {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jpeg-color-leak-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, fixture);
		fs.copyFileSync(path.join(FIXTURES, fixture), source);
		fs.writeFileSync(path.join(dir, "sentinel-sibling.txt"), "untouched");
		return { dir, source };
	}

	function buildStack(route: Route) {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const realNative = new NativeMetadataAdapter();
		const native: NativeMetadataPort =
			route === "native"
				? realNative
				: {
						getCapabilities: () => realNative.getCapabilities(),
						// The library's own pre-write decline shape (measured in 63-06):
						// classifyFallback grants the ExifTool fallback for it.
						sanitize: async () => ({
							ok: false,
							error: {
								code: "native-error",
								nativeCode: "unsupported-format",
								detail: "declined by the test double",
								backend: "native",
								phase: "admission",
								nativeWrite: "not-started",
								libraryError: {
									code: "unsupported-format",
									detail: "declined by the test double",
									path: "declined-by-test-double",
									phase: "admission",
									nativeWrite: "not-started",
								},
							},
						}),
					};
		const nativeWrite = vi.spyOn(native, "sanitize");
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const verify = new VerifyGeneratedOutputQuery({ metadataEngine: hybrid });
		const transaction = new OutputTransaction({
			stripMetadata: new StripMetadataCommand({ metadataEngine: hybrid }),
			verifyGeneratedOutput: verify,
			...realTransactionFileDependencies(),
		});
		return { hybrid, verify, transaction, nativeWrite, exiftoolWrite };
	}

	describe.each(FIXTURE_CASES)("$fixture", ({ fixture, subSampling }) => {
		it("fixture sanity: 3 components, expected subsampling, every seeded tag present", () => {
			const record = readRecord(path.join(FIXTURES, fixture));
			expect(record["File:ColorComponents"]).toBe(3);
			expect(record["File:YCbCrSubSampling"]).toBe(subSampling);
			for (const key of SEEDED_KEYS) {
				expect(Object.keys(record)).toContain(key);
			}
		});

		describe.each(ROUTES)("route %s", (route) => {
			it("OutputTransaction copy publishes, seeded tags gone, source unchanged, directory exact", async () => {
				const { dir, source } = freshDir(fixture);
				const sourceDigestBefore = sha256(source);
				const generatedPath = generateCleanedPath({
					filePath: source,
					exists: fs.existsSync,
				});
				const stack = buildStack(route);

				const before = snapshotDir(dir);
				const result = await stack.transaction.execute({
					filePath: source,
					generatedPath,
					...DEFAULT_PRESERVATION,
					copyModeLeakCheck: {
						demand: "required",
						preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
						preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
						preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
					},
				});
				const after = snapshotDir(dir);

				expect(result).toEqual({
					ok: true,
					value: { outputPath: generatedPath, writtenBy: route },
				});

				// The route really was the one under test (observed, not assumed).
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				if (route === "native") {
					expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				} else {
					expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
				}

				const outputKeys = Object.keys(readRecord(generatedPath));
				for (const key of SEEDED_KEYS) {
					expect(outputKeys).not.toContain(key);
				}
				expect(sha256(source)).toBe(sourceDigestBefore);
				assertDirEffect(before, after, {
					unchanged: [fixture, "sentinel-sibling.txt"],
					added: [path.basename(generatedPath)],
					modified: [],
					removed: [],
				});
			});

			it("VerifyGeneratedOutputQuery accepts the engine-written colour copy", async () => {
				const { dir, source } = freshDir(fixture);
				const destination = path.join(dir, `verdict-${fixture}`);
				const stack = buildStack(route);

				const write = await stack.hybrid.sanitize({
					source,
					destination,
					outputMode: "copy",
					...DEFAULT_PRESERVATION,
				});
				expect(write).toEqual({
					ok: true,
					value: { writtenBy: route },
				});

				const verdict = await stack.verify.execute({
					generatedPath: destination,
					copyModeLeakCheck: {
						demand: "required",
						preserveOrientation: DEFAULT_PRESERVATION.preserveOrientation,
						preserveColorProfile: DEFAULT_PRESERVATION.preserveColorProfile,
						preserveResolution: DEFAULT_PRESERVATION.preserveResolution,
						writtenBy: route,
					},
				});
				expect(verdict).toEqual({
					ok: true,
					value: { exemptionsApplied: [] },
				});
			});
		});
	});
});
