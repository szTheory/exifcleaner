// Phase 63-10 (ADP-06, ADP-07; D-05 #3): native HEIC/AVIF output never needs or uses the
// F-HEIC-ICC exemption, proven on REAL bytes through the REAL stack (real ExiftoolProcess +
// ExifToolAdapter + NativeMetadataAdapter/exifcleaner-node + HybridMetadataEngine +
// StripMetadataCommand + VerifyGeneratedOutputQuery + OutputTransaction). Also pins the
// idempotent, concurrent and interrupted native copy edges.
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
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { seedHeifCopy } from "../helpers/heif_seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

const NATIVE_PATH_FIXTURES = [
	"sample-sips.heic",
	"sample-sips.avif",
	"sample-sips-icc.heic",
	"sample-sips-icc.avif",
	"sample-heifenc.heic",
	"sample-heifenc.avif",
	"grid-heifenc.heic",
	"grid-heifenc.avif",
] as const;

type Combo = {
	readonly mask: number;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
};

const COMBOS: readonly Combo[] = Array.from({ length: 16 }, (_, mask) => ({
	mask,
	preserveOrientation: (mask & 1) !== 0,
	preserveColorProfile: (mask & 2) !== 0,
	preserveResolution: (mask & 4) !== 0,
	preserveTimestamps: (mask & 8) !== 0,
}));

const DEFAULTS: Combo = {
	mask: -1,
	preserveOrientation: true,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: true,
};

const SWEEP_CASES = NATIVE_PATH_FIXTURES.flatMap((name) =>
	COMBOS.map((combo) => ({ name, combo, label: `${name} mask ${combo.mask}` })),
);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function reopenKeys(filePath: string): string[] {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	}).toString();
	const record = (JSON.parse(raw) as Record<string, unknown>[])[0] ?? {};
	return Object.keys(record).sort();
}

function isIccKey(key: string): boolean {
	return key.startsWith("ICC-header:") || key.startsWith("ICC_Profile:");
}

describe("63-10: native HEIC/AVIF output never uses F-HEIC-ICC", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-never-tpl-"));
	const temporaryDirs: string[] = [templateDir];

	beforeAll(async () => {
		// Seed once per fixture into a template dir (D-13); each case copies from it.
		for (const name of NATIVE_PATH_FIXTURES) {
			const target = path.join(templateDir, name);
			fs.copyFileSync(path.join(FIXTURES, name), target);
			seedHeifCopy({ exiftoolPath: EXIFTOOL_PATH, sourcePath: target });
		}
		await exiftoolProcess.open();
	});

	afterAll(async () => {
		await exiftoolProcess.close();
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function freshDir(names: readonly string[]): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-never-"));
		temporaryDirs.push(dir);
		for (const name of names) {
			fs.copyFileSync(path.join(templateDir, name), path.join(dir, name));
		}
		return dir;
	}

	function buildStack() {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const stripMetadata = new StripMetadataCommand({ metadataEngine: hybrid });
		const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		const verifySpy = vi.spyOn(verifyGeneratedOutput, "execute");
		const transaction = new OutputTransaction({
			stripMetadata,
			verifyGeneratedOutput,
			unlink: fs.promises.unlink,
			rename: fs.promises.rename,
			delay: async (milliseconds) => {
				await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
			},
		});
		return {
			hybrid,
			transaction,
			exiftoolWrite,
			nativeWrite,
			verifySpy,
			verifyGeneratedOutput,
		};
	}

	type Stack = ReturnType<typeof buildStack>;

	function copyOnce({
		stack,
		source,
		combo,
		leakCheckCombo = combo,
		signal,
	}: {
		stack: Stack;
		source: string;
		combo: Combo;
		leakCheckCombo?: Combo;
		signal?: AbortSignal;
	}) {
		const generatedPath = generateCleanedPath({
			filePath: source,
			exists: fs.existsSync,
		});
		return {
			generatedPath,
			result: stack.transaction.execute({
				filePath: source,
				generatedPath,
				preserveOrientation: combo.preserveOrientation,
				preserveColorProfile: combo.preserveColorProfile,
				preserveResolution: combo.preserveResolution,
				preserveTimestamps: combo.preserveTimestamps,
				copyModeLeakCheck: {
					preserveOrientation: leakCheckCombo.preserveOrientation,
					preserveColorProfile: leakCheckCombo.preserveColorProfile,
					preserveResolution: leakCheckCombo.preserveResolution,
				},
				...(signal === undefined ? {} : { signal }),
			}),
		};
	}

	describe("real bytes: no ICC residue and no exemption on the native path", () => {
		it.each(["sample-sips-icc.heic", "sample-sips-icc.avif"] as const)(
			"%s: native output with preserveColorProfile=false has no ICC-header or ICC_Profile key (source has them)",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				expect(reopenKeys(source).some(isIccKey)).toBe(true);
				const stack = buildStack();
				const { generatedPath, result } = copyOnce({
					stack,
					source,
					combo: COMBOS[0] as Combo,
				});

				expect(await result).toEqual({
					ok: true,
					value: { outputPath: generatedPath },
				});
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				const keys = reopenKeys(generatedPath);
				expect(keys.filter(isIccKey)).toEqual([]);
			},
		);

		it.each(["sample-sips-icc.heic", "sample-sips-icc.avif"] as const)(
			"%s: native output kept with preserveColorProfile=true then verified as preserveColorProfile=false fails as output-metadata-leak naming ICC keys",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const before = snapshotDir(dir);
				const withIcc = COMBOS.find(
					(c) => c.preserveColorProfile && !c.preserveOrientation,
				) as Combo;
				const withoutIcc = COMBOS[0] as Combo;
				const { result } = copyOnce({
					stack,
					source,
					combo: withIcc,
					leakCheckCombo: withoutIcc,
				});

				const outcome = await result;

				expect(outcome).toEqual({
					ok: false,
					error: {
						code: "verification-failed",
						verificationCode: "output-metadata-leak",
					},
				});
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				const verified = await stack.verifySpy.mock.results[0]?.value;
				expect(verified.ok).toBe(false);
				expect(verified.error.code).toBe("output-metadata-leak");
				expect(verified.error.leakedTags.some(isIccKey)).toBe(true);
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [],
					modified: [],
					removed: [],
				});
			},
		);

		it.each(SWEEP_CASES)(
			"native copy of $label applies no exemption",
			async ({ name, combo }) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const { generatedPath, result } = copyOnce({ stack, source, combo });

				const outcome = await result;

				expect(outcome).toEqual({
					ok: true,
					value: { outputPath: generatedPath },
				});
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				expect(stack.verifySpy).toHaveBeenCalledOnce();
				expect(
					stack.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
				).toBe("native");
				await expect(stack.verifySpy.mock.results[0]?.value).resolves.toEqual({
					ok: true,
					value: { exemptionsApplied: [] },
				});
				expect(sha256(source)).toBe(sourceDigest);
			},
		);
	});

	describe("edges: idempotency, concurrency and interruption", () => {
		it("saving the same default-settings .heic as a copy twice yields two distinct native outputs", async () => {
			const name = "sample-sips.heic";
			const dir = freshDir([name]);
			const source = path.join(dir, name);
			const sourceDigest = sha256(source);
			const stack = buildStack();
			const before = snapshotDir(dir);

			const first = copyOnce({ stack, source, combo: DEFAULTS });
			const firstOutcome = await first.result;
			const second = copyOnce({ stack, source, combo: DEFAULTS });
			const secondOutcome = await second.result;

			expect(first.generatedPath).not.toBe(second.generatedPath);
			expect(path.basename(first.generatedPath)).toBe(
				"sample-sips_cleaned.heic",
			);
			expect(path.basename(second.generatedPath)).toBe(
				"sample-sips_cleaned_2.heic",
			);
			expect(firstOutcome).toEqual({
				ok: true,
				value: { outputPath: first.generatedPath },
			});
			expect(secondOutcome).toEqual({
				ok: true,
				value: { outputPath: second.generatedPath },
			});
			expect(stack.nativeWrite).toHaveBeenCalledTimes(2);
			expect(stack.exiftoolWrite).not.toHaveBeenCalled();
			expect(
				stack.verifySpy.mock.calls.map(
					(call) => call[0]?.copyModeLeakCheck?.writtenBy,
				),
			).toEqual(["native", "native"]);
			expect(sha256(source)).toBe(sourceDigest);
			assertDirEffect(before, snapshotDir(dir), {
				unchanged: [name],
				added: ["sample-sips_cleaned.heic", "sample-sips_cleaned_2.heic"],
				modified: [],
				removed: [],
			});
			// Measured at 63-10: the native rebuild is deterministic, so the two outputs are
			// byte-identical (see 63-EVIDENCE.md "## 63-10 Provenance and native-never").
			expect(reopenKeys(second.generatedPath)).toEqual(
				reopenKeys(first.generatedPath),
			);
			expect(sha256(second.generatedPath)).toBe(sha256(first.generatedPath));
		});

		it("a .heic and an .avif copy run concurrently through one shared engine and process both succeed natively", async () => {
			const names = ["sample-sips.heic", "sample-sips.avif"] as const;
			const dir = freshDir(names);
			const digests = names.map((name) => sha256(path.join(dir, name)));
			const stack = buildStack();
			const before = snapshotDir(dir);

			const runs = names.map((name) =>
				copyOnce({ stack, source: path.join(dir, name), combo: DEFAULTS }),
			);
			const outcomes = await Promise.all(runs.map((run) => run.result));

			outcomes.forEach((outcome, index) => {
				expect(outcome).toEqual({
					ok: true,
					value: { outputPath: runs[index]?.generatedPath },
				});
			});
			expect(stack.nativeWrite).toHaveBeenCalledTimes(2);
			expect(stack.exiftoolWrite).not.toHaveBeenCalled();
			expect(
				stack.verifySpy.mock.calls.map(
					(call) => call[0]?.copyModeLeakCheck?.writtenBy,
				),
			).toEqual(["native", "native"]);
			names.forEach((name, index) => {
				expect(sha256(path.join(dir, name))).toBe(digests[index]);
			});
			assertDirEffect(before, snapshotDir(dir), {
				unchanged: [...names],
				added: ["sample-sips_cleaned.heic", "sample-sips_cleaned.avif"],
				modified: [],
				removed: [],
			});
			expect(
				fs
					.readdirSync(dir)
					.filter((entry) => entry.includes("exifcleaner-stage")),
			).toEqual([]);
		});

		it.each(["sample-sips-icc.heic", "sample-sips-icc.avif"] as const)(
			"%s: a pre-aborted transaction ends not ok with zero ExifTool writes and an unchanged directory",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const controller = new AbortController();
				controller.abort();
				const before = snapshotDir(dir);

				const { result } = copyOnce({
					stack,
					source,
					combo: DEFAULTS,
					signal: controller.signal,
				});
				const outcome = await result;

				expect(outcome).toEqual({ ok: false, error: { code: "write-failed" } });
				expect(stack.nativeWrite).not.toHaveBeenCalled();
				expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				expect(stack.verifySpy).not.toHaveBeenCalled();
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [],
					modified: [],
					removed: [],
				});
				expect(
					fs
						.readdirSync(dir)
						.filter(
							(entry) =>
								entry.includes("_cleaned") ||
								entry.includes("exifcleaner-stage"),
						),
				).toEqual([]);
			},
		);

		// StripMetadataCommand answers an already-aborted signal itself, so the transaction
		// cases above never reach the router. These engine-level cases do: the signal reaches
		// exifcleaner-node, whose abort is an ungranted error, and the router must not retry
		// it on ExifTool (mutant (c) in 63-EVIDENCE.md turns exactly these red).
		it.each(["sample-sips-icc.heic", "sample-sips-icc.avif"] as const)(
			"%s: a pre-aborted engine copy returns the native error and never falls through to ExifTool",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const controller = new AbortController();
				controller.abort();
				const before = snapshotDir(dir);

				const result = await stack.hybrid.sanitize({
					source,
					destination: path.join(dir, "out_cleaned" + path.extname(name)),
					outputMode: "copy",
					preserveOrientation: DEFAULTS.preserveOrientation,
					preserveColorProfile: DEFAULTS.preserveColorProfile,
					preserveResolution: DEFAULTS.preserveResolution,
					preserveTimestamps: DEFAULTS.preserveTimestamps,
					signal: controller.signal,
				});

				expect(result.ok).toBe(false);
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				expect(stack.exiftoolWrite).not.toHaveBeenCalled();
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [],
					modified: [],
					removed: [],
				});
			},
		);
	});
});
