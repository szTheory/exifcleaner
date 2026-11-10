// Phase 69-09 (WEBP-08; D-03, D-05): a Save as copy of every committed WebP shape through the REAL
// stack with the settings a first-time user has (DEFAULT_SETTINGS preservation: orientation, colour
// profile and resolution kept) and with every preserve option off:
//   ExiftoolProcess -> ExifToolAdapter + NativeMetadataAdapter -> HybridMetadataEngine ->
//   StripMetadataCommand + VerifyGeneratedOutputQuery -> OutputTransaction
// with spies on the two engines' writers. The expected disposition of each shape is the 69-08 sweep
// decision (69-WEBP-SWEEP-MATRIX.md "## Shape decisions"): every shape is published by the native
// engine with zero ExifTool writer calls and passes the WebP leak check, except the truncated file,
// which native declines at admission, the ExifTool fallback fails on, and nothing is published.
// Whole-directory assertions throughout: the directory afterwards is the source, an unrelated
// sibling and (only when published) the one cleaned copy; the source bytes never change.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { copyModeLeakCheckFormatOf } from "../../src/domain/exif/copy_mode_leak_check";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { copyModeLeakCheckDemandOf } from "../../src/domain/files/file_types";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
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

interface Shape {
	readonly fixture: string;
	// 69-WEBP-SWEEP-MATRIX.md "## Shape decisions": a pass is a native write that the WebP leak
	// check accepts; a refusal is the truncated file only.
	readonly disposition: "pass" | "refused";
	// Whether the SOURCE carries identifying keys of its own (non-vacuity: a strip that has nothing
	// to remove proves nothing). Measured with the bundled ExifTool before the strip.
	readonly sourceIdentifying: boolean;
	// Keys that must still be in the output under DEFAULT_SETTINGS preservation (the user asked to
	// keep them), proving the preserve path actually ran.
	readonly keptUnderDefault: readonly string[];
}

const SHAPES: readonly Shape[] = [
	{
		fixture: "color_lossy.webp",
		disposition: "pass",
		sourceIdentifying: true,
		keptUnderDefault: [],
	},
	{
		fixture: "webp_lossless.webp",
		disposition: "pass",
		sourceIdentifying: false,
		keptUnderDefault: ["RIFF:AlphaIsUsed"],
	},
	{
		fixture: "webp_alpha.webp",
		disposition: "pass",
		sourceIdentifying: false,
		keptUnderDefault: ["RIFF:AlphaCompression", "RIFF:WebP_Flags"],
	},
	{
		fixture: "webp_animated.webp",
		disposition: "pass",
		sourceIdentifying: false,
		keptUnderDefault: ["RIFF:AnimationLoopCount", "RIFF:Duration"],
	},
	{
		fixture: "webp_icc.webp",
		disposition: "pass",
		sourceIdentifying: false,
		keptUnderDefault: [
			"ICC_Profile:ProfileDescription",
			"ICC-header:ProfileClass",
		],
	},
	{
		fixture: "webp_xmp.webp",
		disposition: "pass",
		sourceIdentifying: true,
		keptUnderDefault: [],
	},
	{
		fixture: "webp_identifying.webp",
		disposition: "pass",
		sourceIdentifying: true,
		keptUnderDefault: [
			"IFD0:Orientation",
			"IFD0:XResolution",
			"IFD0:YResolution",
		],
	},
	{
		fixture: "sample.webp",
		disposition: "pass",
		sourceIdentifying: true,
		keptUnderDefault: ["IFD0:Orientation", "ICC_Profile:ProfileDescription"],
	},
	{
		fixture: "webp_truncated.webp",
		disposition: "refused",
		sourceIdentifying: true,
		keptUnderDefault: [],
	},
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
	"Composite:GPSLatitude",
	"Composite:GPSLongitude",
	"Composite:GPSPosition",
]);
const WEBP_FILE_TYPES = new Set([
	"WEBP",
	"WEBP (lossless)",
	"Extended WEBP",
	"Extended WEBP (lossless)",
]);

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Reopen exactly as the verification does (-j -G1:2:4, no -n), folding keys to Group1:Tag and
// dropping the exempt System group. Names only; values are read just for FileType and the flags.
function reopen(filePath: string): {
	keys: string[];
	fileType: string;
	flags: string | undefined;
} {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath]);
	const record = (JSON.parse(raw.toString()) as Record<string, unknown>[])[0];
	if (record === undefined) throw new Error("no record");
	const keys: string[] = [];
	let fileType = "";
	let flags: string | undefined;
	for (const [key, value] of Object.entries(record)) {
		if (key === "SourceFile") continue;
		const parts = key.split(":").filter((part) => !/^Copy\d+$/.test(part));
		const group1 = parts[0];
		const tag = parts.at(-1);
		if (group1 === undefined || tag === undefined || group1 === "System") {
			continue;
		}
		const folded = `${group1}:${tag}`;
		keys.push(folded);
		if (folded === "File:FileType") fileType = String(value);
		if (folded === "RIFF:WebP_Flags") flags = String(value);
	}
	return { keys: [...new Set(keys)].sort(), fileType, flags };
}

function identifyingKeysOf(keys: readonly string[]): string[] {
	return keys.filter(
		(key) => IDENTIFYING_GROUP.test(key) || IDENTIFYING_TAGS.has(key),
	);
}

const tally = {
	runs: 0,
	pass: 0,
	refused: 0,
	nativeWrites: 0,
	exiftoolWritesOnPass: 0,
	fallbackOnRefused: 0,
};

describe("69-09: default-settings WebP copy through the real stack (WEBP-08)", () => {
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
		// Machine-readable summary for 69-EVIDENCE.md.
		console.log(
			`WEBP-DEFAULT-COPY: shapes=${SHAPES.length} runs=${tally.runs} pass=${tally.pass} refused=${tally.refused} default-engine=native exiftool-writer-calls=${tally.exiftoolWritesOnPass} native-writes=${tally.nativeWrites} fallback-calls-on-refused=${tally.fallbackOnRefused}`,
		);
	});

	async function run({
		shape,
		settings,
	}: {
		shape: Shape;
		settings: Settings;
	}) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "webp-default-copy-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, shape.fixture);
		fs.copyFileSync(path.join(FIXTURES, shape.fixture), source);
		const siblingName = "unrelated-sibling.txt";
		fs.writeFileSync(path.join(dir, siblingName), "keep me");

		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const query = new VerifyGeneratedOutputQuery({ metadataEngine: hybrid });
		const verifySpy = vi.spyOn(query, "execute");
		const transaction = new OutputTransaction({
			stripMetadata: new StripMetadataCommand({ metadataEngine: hybrid }),
			verifyGeneratedOutput: query,
			...realTransactionFileDependencies(),
		});

		const sourceDigest = sha256(source);
		const sourceKeys = reopen(source).keys;
		const before = snapshotDir(dir);
		const generatedPath = generateCleanedPath({
			filePath: source,
			exists: fs.existsSync,
		});
		const demand = copyModeLeakCheckDemandOf({
			filename: source,
			outputMode: "copy",
		});
		expect(demand).toBe("required");
		const outcome = await transaction.execute({
			filePath: source,
			generatedPath,
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
		return {
			dir,
			source,
			sourceDigest,
			sourceKeys,
			siblingName,
			generatedPath,
			before,
			after,
			outcome,
			exiftoolWrite,
			nativeWrite,
			verifySpy,
		};
	}

	const MATRIX = SHAPES.flatMap((shape) =>
		(
			[
				["DEFAULT_SETTINGS preservation", DEFAULT_PRESERVATION],
				["every preserve option off", ALL_OFF],
			] as const
		).map(([label, settings]) => ({ shape, label, settings })),
	);

	it.each(MATRIX.filter((row) => row.shape.disposition === "pass"))(
		"$shape.fixture under $label: native writes it, ExifTool writes nothing, the WebP leak check passes, the directory is source plus sibling plus the one copy",
		async ({ shape, settings }) => {
			const ran = await run({ shape, settings });

			// Engine: native only, zero ExifTool writer calls (the default WebP routing of 69-06).
			expect(ran.nativeWrite).toHaveBeenCalledOnce();
			const nativeResult = await ran.nativeWrite.mock.results[0]?.value;
			expect(nativeResult.ok).toBe(true);
			expect(ran.exiftoolWrite).not.toHaveBeenCalled();
			tally.nativeWrites += 1;
			tally.exiftoolWritesOnPass += ran.exiftoolWrite.mock.calls.length;

			expect(ran.outcome).toEqual({
				ok: true,
				value: { outputPath: ran.generatedPath },
			});
			expect(path.basename(ran.generatedPath)).toBe(
				shape.fixture.replace(/\.webp$/u, "_cleaned.webp"),
			);

			// The leak check really ran, with the native provenance, and accepted the reopened WebP.
			expect(ran.verifySpy).toHaveBeenCalledOnce();
			expect(ran.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck).toMatchObject(
				{
					demand: "required",
					writtenBy: "native",
					preserveOrientation: settings.preserveOrientation,
					preserveColorProfile: settings.preserveColorProfile,
					preserveResolution: settings.preserveResolution,
				},
			);
			await expect(ran.verifySpy.mock.results[0]?.value).resolves.toEqual({
				ok: true,
				value: { exemptionsApplied: [] },
			});

			// Content: the reopened output is a WebP, none of the identifying keys survive.
			const output = reopen(ran.generatedPath);
			expect(WEBP_FILE_TYPES.has(output.fileType), output.fileType).toBe(true);
			expect(copyModeLeakCheckFormatOf({ fileType: output.fileType })).toBe(
				"webp",
			);
			expect(identifyingKeysOf(output.keys)).toEqual([]);
			// Non-vacuity: the source did carry identifying keys where the table says so.
			expect(identifyingKeysOf(ran.sourceKeys).length > 0).toBe(
				shape.sourceIdentifying,
			);

			const nothingKept =
				!settings.preserveOrientation &&
				!settings.preserveColorProfile &&
				!settings.preserveResolution;
			if (nothingKept) {
				// Nothing was asked to be kept: no EXIF, resolution or ICC key and no EXIF/ICC flag.
				expect(
					output.keys.filter(
						(key) => key.startsWith("IFD0:") || key.startsWith("ICC"),
					),
				).toEqual([]);
				expect(output.flags ?? "").not.toMatch(/EXIF|ICC|XMP/u);
			} else {
				for (const key of shape.keptUnderDefault) {
					expect(output.keys, key).toContain(key);
				}
			}

			// Whole directory: the source and the unrelated sibling are untouched, exactly one file
			// was added, no stage or ExifTool temp file is left.
			expect(sha256(ran.source)).toBe(ran.sourceDigest);
			expect(fs.readFileSync(path.join(ran.dir, ran.siblingName), "utf8")).toBe(
				"keep me",
			);
			assertDirEffect(ran.before, ran.after, {
				unchanged: [shape.fixture, ran.siblingName],
				added: [path.basename(ran.generatedPath)],
				modified: [],
				removed: [],
			});
			expect(
				fs
					.readdirSync(ran.dir)
					.filter(
						(entry) =>
							entry.includes("exifcleaner-stage") ||
							entry.includes("_exiftool_tmp"),
					),
			).toEqual([]);
			tally.pass += 1;
		},
	);

	it.each(MATRIX.filter((row) => row.shape.disposition === "refused"))(
		"$shape.fixture under $label: native declines at admission, the ExifTool fallback fails, nothing is published, the directory equals the pre-state",
		async ({ shape, settings }) => {
			const ran = await run({ shape, settings });

			expect(ran.nativeWrite).toHaveBeenCalledOnce();
			const native = await ran.nativeWrite.mock.results[0]?.value;
			expect(native.ok).toBe(false);
			expect(native.error.code).toBe("native-error");
			expect(native.error.nativeCode).toBe("malformed-file");
			expect(native.error.phase).toBe("admission");
			expect(native.error.nativeWrite).toBe("not-started");
			expect(ran.exiftoolWrite).toHaveBeenCalledOnce();
			const fallback = await ran.exiftoolWrite.mock.results[0]?.value;
			expect(fallback.ok).toBe(false);
			expect(fallback.error.backend).toBe("exiftool");
			tally.fallbackOnRefused += ran.exiftoolWrite.mock.calls.length;

			expect(ran.outcome).toEqual({
				ok: false,
				error: { code: "write-failed" },
			});
			// Nothing was written, so the verification never ran.
			expect(ran.verifySpy).not.toHaveBeenCalled();
			expect(fs.existsSync(ran.generatedPath)).toBe(false);
			expect(sha256(ran.source)).toBe(ran.sourceDigest);
			assertDirEffect(ran.before, ran.after, {
				unchanged: [shape.fixture, ran.siblingName],
				added: [],
				modified: [],
				removed: [],
			});
			expect(fs.readdirSync(ran.dir).sort()).toEqual(
				[ran.siblingName, shape.fixture].sort(),
			);
			tally.refused += 1;
		},
	);

	it("the table covers every committed WebP fixture", () => {
		const committed = fs
			.readdirSync(FIXTURES)
			.filter((name) => name.toLowerCase().endsWith(".webp"))
			.sort();
		expect(SHAPES.map((shape) => shape.fixture).sort()).toEqual(committed);
	});
});
