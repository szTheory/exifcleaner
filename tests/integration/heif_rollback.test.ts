// Phase 63-15 (ADP-06, ROADMAP SC2; D-19, milestone D23 lever 1): disabling native HEIC/AVIF
// through exifcleaner-node's private registry seam returns those copies to ExifTool with the same
// user-visible outcome. Real stack end to end (real ExiftoolProcess, ExifToolAdapter,
// NativeMetadataAdapter, HybridMetadataEngine, StripMetadataCommand, VerifyGeneratedOutputQuery,
// OutputTransaction). The seam is a test seam only: no production kill switch exists (v4.10 D-17).
// The package exports map exposes only ".", so the registry is imported by absolute path (F-12).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import { DEFAULT_SETTINGS } from "../../src/domain";
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
const REGISTRY_URL = pathToFileURL(
	path.resolve(
		__dirname,
		"../../node_modules/exifcleaner-node/dist/admission/registry.js",
	),
).href;

interface RegisteredHandlerLike {
	readonly capability: { readonly format: string };
}
interface RegistrySeam {
	setRegisteredHandlersForTests(
		handlers: readonly RegisteredHandlerLike[],
	): () => void;
	registeredHandlersForTests(): readonly RegisteredHandlerLike[];
}

const HEIF_FORMATS: readonly string[] = ["heic", "avif"];

// Closed list of key differences allowed between the native and the ExifTool (rollback) after-inspect
// key sets, each mapped to milestone SUMMARY Decision 15 letters (a)-(e). Populated only from
// 63-SWEEP-MATRIX.md "## Native vs ExifTool": the row "ExifTool adds IFD0:YCbCrPositioning whenever it
// re-creates an Exif block (orientation and/or resolution preserved); native never emits it" is
// Decision 15 (c). Entries (a), (d) and (e) are not observable as `-j -G1:2:4` key names (the same
// section says so), and (b) is a difference only with preserveColorProfile=false, which the default
// settings used here do not select, so no key is listed for them.
export const PERMITTED_DIFFERENCES: Readonly<
	Record<string, "a" | "b" | "c" | "d" | "e">
> = Object.freeze({
	"IFD0:Image:YCbCrPositioning": "c",
});

export interface OutcomeProjection {
	readonly ok: boolean;
	readonly errorCode: string | undefined;
	readonly outputMode: "copy";
	readonly cleanedBasename: string;
	readonly exemptionsApplied: readonly string[];
	readonly leakedPrivacyKeys: readonly string[];
	readonly preserved: {
		readonly Orientation: unknown;
		readonly ProfileDescription: unknown;
	};
	readonly sourceShaBefore: string;
	readonly sourceShaAfter: string;
	readonly afterKeys: readonly string[];
}

// Returns every reason the two runs do not show the same user-visible outcome; empty means equal.
export function compareOutcomeProjections(
	native: OutcomeProjection,
	rollback: OutcomeProjection,
): string[] {
	const problems: string[] = [];
	for (const [label, run] of [
		["native", native],
		["rollback", rollback],
	] as const) {
		if (!run.ok) problems.push(`${label}: result not ok (${run.errorCode})`);
		if (run.leakedPrivacyKeys.length > 0) {
			problems.push(
				`${label}: privacy keys left behind: ${run.leakedPrivacyKeys.join(",")}`,
			);
		}
		if (run.sourceShaBefore !== run.sourceShaAfter) {
			problems.push(`${label}: source bytes changed`);
		}
		if (run.exemptionsApplied.length > 0) {
			problems.push(
				`${label}: exemptions applied: ${run.exemptionsApplied.join(",")}`,
			);
		}
	}
	if (native.errorCode !== rollback.errorCode)
		problems.push("errorCode differs");
	if (native.outputMode !== rollback.outputMode)
		problems.push("outputMode differs");
	if (native.cleanedBasename !== rollback.cleanedBasename) {
		problems.push("cleanedBasename differs");
	}
	if (JSON.stringify(native.preserved) !== JSON.stringify(rollback.preserved)) {
		problems.push("preserved Orientation/ProfileDescription differ");
	}
	const a = new Set(native.afterKeys);
	const b = new Set(rollback.afterKeys);
	const differing = [
		...[...a].filter((k) => !b.has(k)),
		...[...b].filter((k) => !a.has(k)),
	];
	for (const key of differing) {
		if (!Object.prototype.hasOwnProperty.call(PERMITTED_DIFFERENCES, key)) {
			problems.push(`unpermitted after-key difference: ${key}`);
		}
	}
	return problems;
}

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function inspectRecord(filePath: string): Record<string, unknown> {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	}).toString();
	return (JSON.parse(raw) as Record<string, unknown>[])[0] ?? {};
}

const tagName = (key: string): string => key.slice(key.lastIndexOf(":") + 1);

function privacyKeysIn(record: Record<string, unknown>): string[] {
	return Object.keys(record).filter((key) => {
		const name = tagName(key);
		return (
			name.startsWith("GPS") ||
			["Make", "Model", "Artist", "DateTimeOriginal"].includes(name)
		);
	});
}

function valueOf(record: Record<string, unknown>, name: string): unknown {
	const key = Object.keys(record).find((k) => tagName(k) === name);
	return key === undefined ? undefined : record[key];
}

type RunLabel = "native" | "rollback" | "restore";

describe("63-15: HEIC/AVIF rollback to ExifTool keeps the user-visible outcome", () => {
	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const templateDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "heif-rollback-tpl-"),
	);
	const temporaryDirs: string[] = [templateDir];
	let registry: RegistrySeam;

	beforeAll(async () => {
		registry = (await import(/* @vite-ignore */ REGISTRY_URL)) as RegistrySeam;
		for (const ext of [".heic", ".avif"]) {
			const target = path.join(templateDir, `photo${ext}`);
			fs.copyFileSync(path.join(FIXTURES, `sample-sips-icc${ext}`), target);
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

	function buildStack() {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		const verifySpy = vi.spyOn(verifyGeneratedOutput, "execute");
		const transaction = new OutputTransaction({
			stripMetadata: new StripMetadataCommand({ metadataEngine: hybrid }),
			verifyGeneratedOutput,
			unlink: fs.promises.unlink,
			rename: fs.promises.rename,
			delay: async (milliseconds) => {
				await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
			},
		});
		return { native, transaction, exiftoolWrite, nativeWrite, verifySpy };
	}

	async function runCopy({ ext }: { ext: string }) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-rollback-"));
		temporaryDirs.push(dir);
		const name = `photo${ext}`;
		const source = path.join(dir, name);
		fs.copyFileSync(path.join(templateDir, name), source);
		expect(privacyKeysIn(inspectRecord(source)).length).toBeGreaterThan(0);
		const sourceShaBefore = sha256(source);
		const stack = buildStack();
		const before = snapshotDir(dir);
		const generatedPath = generateCleanedPath({
			filePath: source,
			exists: fs.existsSync,
		});
		const settings = DEFAULT_SETTINGS;
		const result = await stack.transaction.execute({
			filePath: source,
			generatedPath,
			preserveOrientation: settings.preserveOrientation,
			preserveColorProfile: settings.preserveColorProfile,
			preserveResolution: settings.preserveResolution,
			preserveTimestamps: settings.preserveTimestamps,
			copyModeLeakCheck: {
				demand: "required",
				preserveOrientation: settings.preserveOrientation,
				preserveColorProfile: settings.preserveColorProfile,
				preserveResolution: settings.preserveResolution,
			},
		});
		assertDirEffect(before, snapshotDir(dir), {
			unchanged: [name],
			added: [path.basename(generatedPath)],
			modified: [],
			removed: [],
		});
		expect(
			fs
				.readdirSync(dir)
				.filter((entry) => entry.includes("exifcleaner-stage")),
		).toEqual([]);
		const verifyOutcome = await stack.verifySpy.mock.results[0]?.value;
		const after = inspectRecord(generatedPath);
		const projection: OutcomeProjection = {
			ok: result.ok,
			errorCode: result.ok ? undefined : result.error.code,
			outputMode: "copy",
			cleanedBasename: path.basename(generatedPath),
			exemptionsApplied:
				verifyOutcome?.ok === true
					? verifyOutcome.value.exemptionsApplied
					: ["<verify-failed>"],
			leakedPrivacyKeys: privacyKeysIn(after),
			preserved: {
				Orientation: valueOf(after, "Orientation"),
				ProfileDescription: valueOf(after, "ProfileDescription"),
			},
			sourceShaBefore,
			sourceShaAfter: sha256(source),
			afterKeys: Object.keys(after)
				.filter((k) => !k.startsWith("System:") && !k.startsWith("ExifTool:"))
				.sort(),
		};
		return {
			projection,
			outputSha: sha256(generatedPath),
			writtenBy:
				stack.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
			spyCounts: {
				native: stack.nativeWrite.mock.calls.length,
				exiftool: stack.exiftoolWrite.mock.calls.length,
			},
		};
	}

	// The seam must precede construction: the adapter freezes capabilities and the hybrid engine
	// snapshots them (Pitfall 3). The guard proves the seam hit the module instance the adapter loaded
	// (Pitfall 4): a fresh adapter built under the seam must no longer advertise heic or avif.
	async function runRolledBack({
		ext,
		applySeam = true,
	}: {
		ext: string;
		applySeam?: boolean;
	}) {
		const restore = applySeam
			? registry.setRegisteredHandlersForTests(
					registry
						.registeredHandlersForTests()
						.filter((h) => !HEIF_FORMATS.includes(h.capability.format)),
				)
			: () => undefined;
		try {
			const formats = new NativeMetadataAdapter()
				.getCapabilities()
				.formats.map((f) => f.format);
			expect(formats).not.toContain("heic");
			expect(formats).not.toContain("avif");
			expect(formats).toContain("png");
			return await runCopy({ ext });
		} finally {
			restore();
		}
	}

	it.each([".heic", ".avif"])(
		"%s: native, rollback and restore runs agree on the user-visible outcome",
		async (ext) => {
			const runs: Record<RunLabel, Awaited<ReturnType<typeof runCopy>>> = {
				native: await runCopy({ ext }),
				rollback: await runRolledBack({ ext }),
				restore: await runCopy({ ext }),
			};

			expect(runs.native.spyCounts).toEqual({ native: 1, exiftool: 0 });
			expect(runs.rollback.spyCounts).toEqual({ native: 0, exiftool: 1 });
			expect(runs.restore.spyCounts).toEqual({ native: 1, exiftool: 0 });
			expect(runs.native.writtenBy).toBe("native");
			expect(runs.rollback.writtenBy).toBe("exiftool");
			expect(runs.restore.writtenBy).toBe("native");

			expect(
				compareOutcomeProjections(
					runs.native.projection,
					runs.rollback.projection,
				),
			).toEqual([]);
			expect(
				compareOutcomeProjections(
					runs.native.projection,
					runs.restore.projection,
				),
			).toEqual([]);
			expect(runs.native.projection.ok).toBe(true);
			expect(runs.native.projection.cleanedBasename).toBe(
				`photo_cleaned${ext}`,
			);
			// F-HEIC-DECL: the two engines write different bytes, so equal outcomes are not a no-op.
			expect(runs.native.outputSha).not.toBe(runs.rollback.outputSha);
		},
	);

	describe("comparer negative controls (synthetic projections)", () => {
		const good: OutcomeProjection = {
			ok: true,
			errorCode: undefined,
			outputMode: "copy",
			cleanedBasename: "photo_cleaned.heic",
			exemptionsApplied: [],
			leakedPrivacyKeys: [],
			preserved: { Orientation: "Rotate 90 CW", ProfileDescription: "sRGB" },
			sourceShaBefore: "aa",
			sourceShaAfter: "aa",
			afterKeys: ["File:FileType", "IFD0:Orientation"],
		};

		it("accepts identical projections and a permitted key difference", () => {
			expect(compareOutcomeProjections(good, good)).toEqual([]);
			expect(
				compareOutcomeProjections(good, {
					...good,
					afterKeys: [...good.afterKeys, "IFD0:Image:YCbCrPositioning"],
				}),
			).toEqual([]);
		});

		it("flags GPS left behind in the rollback run", () => {
			const problems = compareOutcomeProjections(good, {
				...good,
				leakedPrivacyKeys: ["GPS:GPSLatitude"],
			});
			expect(problems.length).toBeGreaterThan(0);
		});

		it("flags a modified source", () => {
			const problems = compareOutcomeProjections(good, {
				...good,
				sourceShaAfter: "bb",
			});
			expect(problems.length).toBeGreaterThan(0);
		});

		it("flags an after-key difference outside PERMITTED_DIFFERENCES", () => {
			const problems = compareOutcomeProjections(good, {
				...good,
				afterKeys: [...good.afterKeys, "XMP-dc:Creator"],
			});
			expect(problems.length).toBeGreaterThan(0);
		});
	});
});
