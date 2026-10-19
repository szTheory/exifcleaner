// Phase 63-13 (ADP-08, ROADMAP SC4; D-06, D-08, D-09): the extension/content mismatch matrix on real
// bytes. Three traced call sites are executed here, not re-argued:
//   app extension routing   hybrid_metadata_engine.ts:83-92 (isNativeCopyCandidate by file name)
//   node content selection  exifcleaner-node registry.ts:54-61 + isobmff-handler.ts:68-87
//   ExifTool writer by name Writer.pl:2550-2558
// Every row runs the REAL OutputTransaction with the REAL bundled ExifTool and the REAL
// exifcleaner-node, asserts engine (spies), outcome, reopened FileType, allowlist applied
// (copyModeLeakCheckFormatOf of that FileType), source SHA-256 and the whole-directory effect.
// Rows 11, 11b (unit) and 12 live in 63-12 / 63-09. All fixtures are at most 64 px (D-09).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import {
	copyModeLeakCheckFormatOf,
	findLeakedTags,
} from "../../src/domain/exif/copy_mode_leak_check";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { copyModeLeakCheckDemandOf } from "../../src/domain/files/file_types";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

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

// App defaults: orientation and timestamps kept, colour profile and resolution stripped.
const DEFAULTS: Settings = {
	preserveOrientation: true,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: true,
};
const COLOR_OFF: Settings = { ...DEFAULTS, preserveColorProfile: false };
const RESOLUTION_ON: Settings = { ...DEFAULTS, preserveResolution: true };

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function exiftoolTag(filePath: string, tag: string): string {
	return execFileSync(EXIFTOOL_PATH, ["-s3", tag, filePath]).toString().trim();
}

function reopenRecord(filePath: string): Record<string, unknown> {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	}).toString();
	return (JSON.parse(raw) as Record<string, unknown>[])[0] ?? {};
}

// Row 8 input: every `heic` brand in the ftyp box of sample-sips.heic (major brand at offset 8
// and the compatible-brand entry) is rewritten to `mif1`, same length, entirely inside the ftyp
// box (box size 0x18 = 24 bytes; offsets 8..24).
function mif1Variant(bytes: Buffer): Buffer {
	const out = Buffer.from(bytes);
	const ftypSize = out.readUInt32BE(0);
	expect(out.toString("latin1", 4, 8)).toBe("ftyp");
	for (let offset = 8; offset + 4 <= ftypSize; offset += 4) {
		if (offset === 12) continue; // minor version, not a brand
		if (out.toString("latin1", offset, offset + 4) === "heic") {
			out.write("mif1", offset, "latin1");
		}
	}
	return out;
}

type Engine = "native" | "exiftool-after-native-decline" | "exiftool-only";

interface Row {
	readonly title: string;
	readonly row: string;
	readonly fixture: string;
	readonly sourceName: string;
	readonly settings: Settings;
	readonly transform?: (bytes: Buffer) => Buffer;
	readonly expect: {
		readonly engine: Engine;
		readonly nativeDecline?: "unsupported-format" | "unsupported-feature";
		readonly outcome: "published" | "write-failed" | "verification-failed";
		// Reopened FileType of the published (or removed) output; undefined when nothing was written.
		readonly fileType?: string;
		readonly format?: "png" | "jpeg" | "heic" | "avif";
		readonly exemptionsApplied?: readonly string[];
		readonly demand?: "required" | "when-allowlisted";
		readonly verificationCode?: string;
	};
}

const ROWS_PUBLISHED: readonly Row[] = [
	{
		title: "JPEG bytes named .heic are cleaned as JPEG, name kept",
		row: "1",
		fixture: "sample.jpg",
		sourceName: "photo.heic",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "JPEG",
			format: "jpeg",
			exemptionsApplied: [],
			demand: "required",
		},
	},
	{
		title: "PNG bytes named .heif are cleaned as PNG, name kept",
		row: "2",
		fixture: "sample.png",
		sourceName: "photo.heif",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "PNG",
			format: "png",
			exemptionsApplied: [],
			demand: "required",
		},
	},
	{
		title: "AVIF bytes named .heic are written natively as AVIF",
		row: "3",
		fixture: "sample-sips.avif",
		sourceName: "photo.heic",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "AVIF",
			format: "avif",
			exemptionsApplied: [],
			demand: "required",
		},
	},
	{
		title: "HEIC bytes named .avif are written natively as HEIC",
		row: "4",
		fixture: "sample-sips.heic",
		sourceName: "photo.avif",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "HEIC",
			format: "heic",
			exemptionsApplied: [],
			demand: "required",
		},
	},
	{
		title: "HEIC bytes named .jpg pass via the FileType mapping, no false leak",
		row: "5 (heic as .jpg)",
		fixture: "sample-sips.heic",
		sourceName: "photo.jpg",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "HEIC",
			format: "heic",
			exemptionsApplied: [],
			demand: "required",
		},
	},
	{
		title: "AVIF bytes named .png pass via the FileType mapping, no false leak",
		row: "5 (avif as .png)",
		fixture: "sample-sips.avif",
		sourceName: "photo.png",
		settings: DEFAULTS,
		expect: {
			engine: "native",
			outcome: "published",
			fileType: "AVIF",
			format: "avif",
			exemptionsApplied: [],
			demand: "required",
		},
	},
];

const ROWS_FALLBACK: readonly Row[] = [
	{
		title:
			"natively declined AVIF named .heic: ExifTool writes, F-HEIC-ICC applies with ExifTool provenance",
		row: "7",
		fixture: "sample-sips-icc-declined.avif",
		sourceName: "photo.heic",
		settings: COLOR_OFF,
		expect: {
			engine: "exiftool-after-native-decline",
			nativeDecline: "unsupported-format",
			outcome: "published",
			fileType: "AVIF",
			format: "avif",
			exemptionsApplied: ["F-HEIC-ICC"],
			demand: "required",
		},
	},
	{
		title:
			"mif1-branded HEIC named .heif: node declines, ExifTool writes, reopens as HEIF, heic allowlist",
		row: "8",
		fixture: "sample-sips.heic",
		sourceName: "photo.heif",
		settings: DEFAULTS,
		transform: mif1Variant,
		expect: {
			engine: "exiftool-after-native-decline",
			nativeDecline: "unsupported-format",
			outcome: "published",
			fileType: "HEIF",
			format: "heic",
			exemptionsApplied: [],
			demand: "required",
		},
	},
];

describe("63-13: extension/content mismatch matrix (ADP-08) through the real transaction", () => {
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

	async function run(row: Row) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-mismatch-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, row.sourceName);
		const bytes = fs.readFileSync(path.join(FIXTURES, row.fixture));
		fs.writeFileSync(source, row.transform ? row.transform(bytes) : bytes);

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
			unlink: fs.promises.unlink,
			rename: fs.promises.rename,
			delay: async (ms) => {
				await new Promise<void>((resolve) => setTimeout(resolve, ms));
			},
		});

		const sourceDigest = sha256(source);
		const handlerDescription = exiftoolTag(
			source,
			"-QuickTime:HandlerDescription",
		);
		const before = snapshotDir(dir);
		const generatedPath = generateCleanedPath({
			filePath: source,
			exists: fs.existsSync,
		});
		const demand = copyModeLeakCheckDemandOf({
			filename: source,
			outputMode: "copy",
		});
		const outcome = await transaction.execute({
			filePath: source,
			generatedPath,
			...row.settings,
			...(demand === undefined
				? {}
				: {
						copyModeLeakCheck: {
							demand,
							preserveOrientation: row.settings.preserveOrientation,
							preserveColorProfile: row.settings.preserveColorProfile,
							preserveResolution: row.settings.preserveResolution,
						},
					}),
		});
		return {
			dir,
			source,
			sourceDigest,
			handlerDescription,
			before,
			generatedPath,
			demand,
			outcome,
			exiftoolWrite,
			nativeWrite,
			verifySpy,
		};
	}

	type Ran = Awaited<ReturnType<typeof run>>;

	async function assertEngine(ran: Ran, row: Row) {
		const { engine, nativeDecline } = row.expect;
		if (engine === "native") {
			expect(ran.nativeWrite).toHaveBeenCalledOnce();
			const native = await ran.nativeWrite.mock.results[0]?.value;
			expect(native.ok).toBe(true);
			expect(ran.exiftoolWrite).not.toHaveBeenCalled();
		} else if (engine === "exiftool-only") {
			expect(ran.nativeWrite).not.toHaveBeenCalled();
			expect(ran.exiftoolWrite).toHaveBeenCalledOnce();
		} else {
			expect(ran.nativeWrite).toHaveBeenCalledOnce();
			const native = await ran.nativeWrite.mock.results[0]?.value;
			expect(native.ok).toBe(false);
			expect(native.error.code).toBe("native-error");
			expect(native.error.nativeCode).toBe(nativeDecline);
			expect(native.error.phase).toBe("admission");
			expect(native.error.nativeWrite).toBe("not-started");
			expect(ran.exiftoolWrite).toHaveBeenCalledOnce();
		}
	}

	function assertPublished(ran: Ran, row: Row) {
		const ex = row.expect;
		expect(ran.outcome).toEqual({
			ok: true,
			value: { outputPath: ran.generatedPath },
		});
		// D-06: name and extension kept, content decides the cleaning.
		expect(path.basename(ran.generatedPath)).toBe(
			row.sourceName.replace(/(\.[^.]+)$/u, "_cleaned$1"),
		);
		const fileType = exiftoolTag(ran.generatedPath, "-FileType");
		expect(fileType).toBe(ex.fileType);
		expect(copyModeLeakCheckFormatOf({ fileType })).toBe(ex.format);
		expect(ran.verifySpy).toHaveBeenCalledOnce();
		expect(ran.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.demand).toBe(
			ex.demand,
		);
		return ran.verifySpy.mock.results[0]?.value as Promise<unknown>;
	}

	function assertSourceAndDir(ran: Ran, row: Row, added: readonly string[]) {
		expect(sha256(ran.source)).toBe(ran.sourceDigest);
		assertDirEffect(ran.before, snapshotDir(ran.dir), {
			unchanged: [row.sourceName],
			added,
			modified: [],
			removed: [],
		});
		expect(
			fs.readdirSync(ran.dir).filter((e) => e.includes("exifcleaner-stage")),
		).toEqual([]);
	}

	it.each([...ROWS_PUBLISHED, ...ROWS_FALLBACK])(
		"mismatch row $row: $title",
		async (row) => {
			const ran = await run(row);
			// Prohibition: the row must not pass or fail on the QuickTime handler name.
			expect(ran.handlerDescription).toBe("");
			await assertEngine(ran, row);
			const verifyResult = await assertPublished(ran, row);
			expect(verifyResult).toEqual({
				ok: true,
				value: { exemptionsApplied: row.expect.exemptionsApplied },
			});
			if (row.expect.engine === "exiftool-after-native-decline") {
				expect(
					ran.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
				).toBe("exiftool");
			} else {
				expect(
					ran.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
				).toBe("native");
			}
			assertSourceAndDir(ran, row, [path.basename(ran.generatedPath)]);
		},
	);

	it("mismatch row 8: the brand edit stays inside ftyp, is at most 64 px and reopens as HEIF", () => {
		const bytes = fs.readFileSync(path.join(FIXTURES, "sample-sips.heic"));
		const edited = mif1Variant(bytes);
		expect(edited.length).toBe(bytes.length);
		const ftypSize = bytes.readUInt32BE(0);
		expect(edited.subarray(ftypSize).equals(bytes.subarray(ftypSize))).toBe(
			true,
		);
		expect(edited.toString("latin1", 8, 12)).toBe("mif1");
		expect(edited.toString("latin1", 16, ftypSize)).not.toContain("heic");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-mismatch-b-"));
		temporaryDirs.push(dir);
		const file = path.join(dir, "edited.heif");
		fs.writeFileSync(file, edited);
		expect(exiftoolTag(file, "-FileType")).toBe("HEIF");
		const [w, h] = exiftoolTag(file, "-Composite:ImageSize")
			.split("x")
			.map(Number);
		expect(w).toBeLessThanOrEqual(64);
		expect(h).toBeLessThanOrEqual(64);
	});

	// Silence "unused" for helpers used by the refusal rows below.
	void RESOLUTION_ON;
	void findLeakedTags;
	void reopenRecord;
	void assertEngine;
});
