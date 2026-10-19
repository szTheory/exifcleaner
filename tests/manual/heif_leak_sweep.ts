// Phase 63-07 (D-14): the measured two-engine HEIC/AVIF copy-mode leak sweep. Run with:
//   ASDF_NODEJS_VERSION=22.14.0 yarn tsx tests/manual/heif_leak_sweep.ts --output <json path>
//     [--extra <absolute path>]... [--verdict] [--only <fixture name substring>]
//
// Deliberately NOT a vitest test (no `.test.ts` suffix) and NOT run in CI: a local reproducer
// that backs `.planning/phases/63-app-adoption/63-SWEEP-MATRIX.md` and
// `tests/domain/fixtures/copy_mode_heif_sweep.json`. `verify:direffect`
// (scripts/dir_effect_gate.mjs) only collects `tests/**/*.test.ts`, `.spec.ts` and `.smoke.ts`
// files, so this file is out of its scope, exactly like copy_mode_leak_sweep.ts (Phase 58).
//
// Every committed HEIF fixture is measured plain and seeded (seeded on a scratch copy via
// seedHeifCopy; no seeded file is ever committed), over the full 2^4 product of
// preserveOrientation x preserveColorProfile x preserveResolution x preserveTimestamps. Each
// variant x combo gets a `route: "router"` row through a real HybridMetadataEngine (the engine
// that actually wrote is observed by wrapping both adapters) and, when the router wrote
// natively, a `route: "exiftool-direct"` row through ExifToolAdapter.sanitize with the same
// request: the output a lever-1 rollback or a fallback would publish (D-15).
//
// `--extra <path>` measures an external file the same way, labelled by its sha256 prefix. Extra
// rows print to stdout only (key names and handler strings, never values) and are NEVER written
// into the `--output` JSON, so external inputs can be measured without being committed (BMF-06).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLeakedTags } from "../../src/domain/exif/copy_mode_leak_check";
import { copyModeLeakCheckFormatOf } from "../../src/domain/exif/copy_mode_leak_check";
import { groupAndTagOf } from "../../src/domain/exif/exif";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { seedHeifCopy } from "../helpers/heif_seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EXIFTOOL_PATH = path.join(REPO_ROOT, ".resources/nix/bin/exiftool");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests/e2e/fixtures");

const MARKER = "ZZ63-";

// Committed native-path fixtures (63-05) and ExifTool-path fixtures (63-06).
const NATIVE_FIXTURES = [
	"sample-sips.heic",
	"sample-sips.avif",
	"sample-sips-icc.heic",
	"sample-sips-icc.avif",
	"sample-heifenc.heic",
	"sample-heifenc.avif",
	"grid-heifenc.heic",
	"grid-heifenc.avif",
] as const;
const EXIFTOOL_PATH_FIXTURES = [
	"QuickTime.heic",
	"red-at-12-oclock-with-color-profile-lossy.avif",
	"sample-sips-icc-declined.heic",
	"sample-sips-icc-declined.avif",
] as const;

interface Cli {
	readonly output: string;
	readonly extras: readonly string[];
	readonly verdict: boolean;
	readonly only: string | undefined;
}

function parseCli(): Cli {
	const args = process.argv.slice(2);
	let output: string | undefined;
	let verdict = false;
	let only: string | undefined;
	const extras: string[] = [];
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--output") {
			output = args[(i += 1)];
		} else if (arg === "--extra") {
			const value = args[(i += 1)];
			if (value === undefined) throw new Error("--extra needs a path");
			extras.push(path.resolve(value));
		} else if (arg === "--verdict") {
			verdict = true;
		} else if (arg === "--only") {
			only = args[(i += 1)];
		} else {
			throw new Error(`Unknown argument: ${String(arg)}`);
		}
	}
	if (output === undefined) {
		throw new Error(
			"Usage: heif_leak_sweep.ts --output <json path> [--extra <abs path>]... [--verdict] [--only <name>]",
		);
	}
	return { output: path.resolve(output), extras, verdict, only };
}

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// -----------------------------------------------------------------------------------------
// Variants and combos
// -----------------------------------------------------------------------------------------

interface Variant {
	readonly name: string;
	readonly fixtureSha256: string;
	readonly extension: string;
	readonly external: boolean;
	readonly seeded: boolean;
	readonly sourcePath: string; // read-only origin, copied into scratch by build()
}

interface Combo {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
}

const COMBOS: readonly Combo[] = (() => {
	const combos: Combo[] = [];
	for (const preserveOrientation of [false, true]) {
		for (const preserveColorProfile of [false, true]) {
			for (const preserveResolution of [false, true]) {
				for (const preserveTimestamps of [false, true]) {
					combos.push({
						preserveOrientation,
						preserveColorProfile,
						preserveResolution,
						preserveTimestamps,
					});
				}
			}
		}
	}
	return combos;
})();

function comboLabel(combo: Combo): string {
	const flags: string[] = [];
	if (combo.preserveOrientation) flags.push("orientation");
	if (combo.preserveColorProfile) flags.push("colorProfile");
	if (combo.preserveResolution) flags.push("resolution");
	if (combo.preserveTimestamps) flags.push("timestamps");
	return flags.length === 0 ? "none" : flags.join("+");
}

// -----------------------------------------------------------------------------------------
// Rows
// -----------------------------------------------------------------------------------------

interface SweepRow {
	readonly variant: string;
	readonly fixtureSha256: string;
	readonly format: "heic" | "avif";
	readonly fileType: string | null;
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
	readonly engine: "native" | "exiftool";
	readonly route: "router" | "exiftool-direct";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
	readonly handlerDescription: string | null;
	readonly decline?: {
		readonly nativeCode: string;
		readonly phase: string;
		readonly nativeWrite: string;
	};
	readonly error?: string;
}

interface Reopened {
	readonly keys: string[];
	readonly fileType: string | null;
	readonly handlerDescription: string | null;
	readonly markerHits: string[];
	readonly record: Record<string, unknown>;
}

// -j -G1:2:4 once; CopyN folded exactly as groupAndTagOf does (first and last segments).
function reopen(filePath: string): Reopened {
	const raw = execFileSync(EXIFTOOL_PATH, ["-j", "-G1:2:4", filePath], {
		maxBuffer: 64 * 1024 * 1024,
	}).toString();
	const parsed = JSON.parse(raw) as Record<string, unknown>[];
	const record = parsed[0];
	if (record === undefined) {
		throw new Error(`No record read back from ${filePath}`);
	}
	const keys = new Set<string>();
	let fileType: string | null = null;
	let handlerDescription: string | null = null;
	const markerHits: string[] = [];
	for (const [key, value] of Object.entries(record)) {
		const folded = groupAndTagOf({ key });
		if (folded !== undefined) {
			const name = `${folded.group1}:${folded.tag}`;
			keys.add(name);
			if (name === "File:FileType" && typeof value === "string") {
				fileType = value;
			}
			if (name === "QuickTime:HandlerDescription") {
				handlerDescription = String(value);
			}
		}
		const text = typeof value === "string" ? value : JSON.stringify(value);
		if (text.includes(MARKER)) markerHits.push(key);
	}
	return {
		keys: [...keys].sort(),
		fileType,
		handlerDescription,
		markerHits,
		record,
	};
}

// -----------------------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------------------

async function main(): Promise<void> {
	const cli = parseCli();
	const scratchRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "gsd63-heif-sweep-"),
	);
	const variantsDir = path.join(scratchRoot, "variants");
	const outputsDir = path.join(scratchRoot, "outputs");
	fs.mkdirSync(variantsDir);
	fs.mkdirSync(outputsDir);

	const variants: Variant[] = [];
	const committed = [...NATIVE_FIXTURES, ...EXIFTOOL_PATH_FIXTURES].filter(
		(name) => cli.only === undefined || name.includes(cli.only),
	);
	for (const name of committed) {
		const sourcePath = path.join(FIXTURES_DIR, name);
		const digest = sha256(sourcePath);
		for (const seeded of [false, true]) {
			variants.push({
				name: seeded ? `${name}+seeded` : name,
				fixtureSha256: digest,
				extension: path.extname(name),
				external: false,
				seeded,
				sourcePath,
			});
		}
	}
	for (const extraPath of cli.extras) {
		const digest = sha256(extraPath);
		for (const seeded of [false, true]) {
			const label = `extra-${digest.slice(0, 8)}`;
			variants.push({
				name: seeded ? `${label}+seeded` : label,
				fixtureSha256: digest,
				extension: path.extname(extraPath).toLowerCase(),
				external: true,
				seeded,
				sourcePath: extraPath,
			});
		}
	}

	const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	await exiftoolProcess.open();
	const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
	const native = new NativeMetadataAdapter();

	// Observe which engine the real router actually takes, without changing either adapter.
	const obs: {
		exiftoolCalls: number;
		nativeResult:
			Awaited<ReturnType<NativeMetadataAdapter["sanitize"]>> | undefined;
		observing: boolean;
	} = { exiftoolCalls: 0, nativeResult: undefined, observing: false };
	const originalExiftoolSanitize = exiftool.sanitize.bind(exiftool);
	const originalNativeSanitize = native.sanitize.bind(native);
	exiftool.sanitize = (request) => {
		if (obs.observing) obs.exiftoolCalls += 1;
		return originalExiftoolSanitize(request);
	};
	native.sanitize = async (request) => {
		const result = await originalNativeSanitize(request);
		if (obs.observing) obs.nativeResult = result;
		return result;
	};
	const readNative = (): typeof obs.nativeResult => obs.nativeResult;
	const router = new HybridMetadataEngine({ exiftool, native });

	const rows: SweepRow[] = [];
	const extraRows: SweepRow[] = [];
	const markerFailures: string[] = [];
	const verdictLines: string[] = [];
	let seq = 0;

	try {
		for (const variant of variants) {
			const dir = path.join(variantsDir, `v${variants.indexOf(variant)}`);
			fs.mkdirSync(dir);
			const source = path.join(dir, `input${variant.extension}`);
			fs.copyFileSync(variant.sourcePath, source);
			if (variant.seeded) {
				try {
					seedHeifCopy({ exiftoolPath: EXIFTOOL_PATH, sourcePath: source });
				} catch (error: unknown) {
					console.log(
						`SEED_SKIPPED variant=${variant.name} reason=${String(error instanceof Error ? error.message.split("\n")[0] : error)}`,
					);
					continue;
				}
			}
			const format = variant.extension === ".avif" ? "avif" : "heic";

			for (const combo of COMBOS) {
				const label = comboLabel(combo);
				const base = {
					variant: variant.name,
					fixtureSha256: variant.fixtureSha256,
					format,
					combo: label,
					...combo,
				} as const;

				const record = async (
					route: SweepRow["route"],
					destination: string,
					engine: SweepRow["engine"],
					result: { ok: boolean; errorText?: string },
					decline: SweepRow["decline"] | undefined,
				): Promise<void> => {
					let row: SweepRow;
					if (!result.ok) {
						row = {
							...base,
							fileType: null,
							engine,
							route,
							outcome: decline === undefined ? "error" : "declined",
							keys: [],
							handlerDescription: null,
							...(decline === undefined ? {} : { decline }),
							...(result.errorText === undefined
								? {}
								: { error: result.errorText }),
						};
					} else {
						const reopened = reopen(destination);
						if (reopened.markerHits.length > 0) {
							markerFailures.push(
								`${variant.name} ${label} ${route}: ${reopened.markerHits.join(",")}`,
							);
						}
						row = {
							...base,
							fileType: reopened.fileType,
							engine,
							route,
							outcome: "written",
							keys: reopened.keys,
							handlerDescription: reopened.handlerDescription,
						};
						if (cli.verdict) {
							const verdictFormat = copyModeLeakCheckFormatOf({
								fileType: reopened.fileType,
							});
							if (verdictFormat === undefined) {
								verdictLines.push(
									`VERDICT variant=${variant.name} combo=${label} route=${route} engine=${engine} fileType=${String(reopened.fileType)} no-format`,
								);
							} else {
								const verdict = findLeakedTags({
									record: reopened.record,
									format: verdictFormat,
									preservation: combo,
									writtenBy: engine,
									fileType: String(reopened.fileType),
								});
								verdictLines.push(
									`VERDICT variant=${variant.name} combo=${label} route=${route} engine=${engine} fileType=${String(reopened.fileType)} leaked=[${verdict.leakedTags.join(",")}] exemptionsApplied=[${verdict.exemptionsApplied.join(",")}]`,
								);
							}
						}
					}
					if (variant.external) {
						extraRows.push(row);
						console.log(
							`EXTRA_ROW ${JSON.stringify({
								variant: row.variant,
								combo: row.combo,
								route: row.route,
								engine: row.engine,
								outcome: row.outcome,
								fileType: row.fileType,
								handlerDescription: row.handlerDescription,
								keys: row.keys,
								decline: row.decline,
							})}`,
						);
					} else {
						rows.push(row);
					}
				};

				// Router row.
				seq += 1;
				const routerDestination = path.join(
					outputsDir,
					`${seq}-router${variant.extension}`,
				);
				obs.exiftoolCalls = 0;
				obs.nativeResult = undefined;
				obs.observing = true;
				const routed = await router.sanitize({
					source,
					destination: routerDestination,
					outputMode: "copy",
					...combo,
				});
				obs.observing = false;
				const observedNative = readNative();
				const routedEngine: SweepRow["engine"] = routed.ok
					? routed.value.writtenBy
					: observedNative !== undefined &&
						  !observedNative.ok &&
						  obs.exiftoolCalls === 0
						? "native"
						: "exiftool";
				const nativeDecline =
					observedNative !== undefined && !observedNative.ok
						? {
								nativeCode: observedNative.error.nativeCode,
								phase: observedNative.error.phase,
								nativeWrite: observedNative.error.nativeWrite,
							}
						: undefined;
				await record(
					"router",
					routerDestination,
					routedEngine,
					routed.ok
						? { ok: true }
						: { ok: false, errorText: JSON.stringify(routed.error) },
					// Record the native decline that triggered a fallback even on a written row.
					undefined,
				);
				if (routed.ok && routedEngine === "exiftool" && nativeDecline) {
					// Annotate the just-pushed router row with the decline class that caused the fallback.
					const target = variant.external ? extraRows : rows;
					const last = target.pop();
					if (last !== undefined) {
						target.push({ ...last, decline: nativeDecline });
					}
				}

				// Direct ExifTool row for every natively written variant (rollback/fallback output).
				if (routed.ok && routedEngine === "native") {
					seq += 1;
					const directDestination = path.join(
						outputsDir,
						`${seq}-direct${variant.extension}`,
					);
					const direct = await originalExiftoolSanitize({
						source,
						destination: directDestination,
						outputMode: "copy",
						...combo,
					});
					await record(
						"exiftool-direct",
						directDestination,
						"exiftool",
						direct.ok
							? { ok: true }
							: { ok: false, errorText: JSON.stringify(direct.error) },
						undefined,
					);
				}
				for (const f of fs.readdirSync(outputsDir)) {
					fs.rmSync(path.join(outputsDir, f), { force: true });
				}
			}
		}
	} finally {
		await exiftoolProcess.close();
	}

	fs.writeFileSync(
		cli.output,
		`${JSON.stringify({ generatedBy: "tests/manual/heif_leak_sweep.ts", rows }, null, "\t")}\n`,
	);

	for (const line of verdictLines) console.log(line);

	console.log(`SWEEP_ROWS=${rows.length}`);
	console.log(`SWEEP_EXTRA_ROWS=${extraRows.length}`);
	console.log(
		`SWEEP_OUTCOMES=written:${rows.filter((r) => r.outcome === "written").length},declined:${rows.filter((r) => r.outcome === "declined").length},error:${rows.filter((r) => r.outcome === "error").length}`,
	);
	console.log(
		`SWEEP_ENGINES=${[...new Set(rows.map((r) => `${r.route}:${r.engine}`))].sort().join(",")}`,
	);

	fs.rmSync(scratchRoot, { recursive: true, force: true });

	if (markerFailures.length > 0) {
		console.error("REMOVAL_CONFIRMATION_FAILURES:");
		for (const failure of markerFailures) console.error(`  ${failure}`);
		process.exit(1);
	}
	console.log(`REMOVAL_CONFIRMATION=no ${MARKER} marker in any output`);
	console.log("SWEEP_COMPLETE");
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
