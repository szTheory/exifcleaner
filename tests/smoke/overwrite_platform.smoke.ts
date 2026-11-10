// Phase 69-15 (OVR-03; A4, D-16; measurements M-02..M-07): the INSTALLED app overwrites a file on
// every OS, and the filesystem behaviour that vitest cannot reach on Windows (vitest does not run
// there in CI) is measured here through window.api.exif.removeMetadata.
//
// Each observation prints one stable line to stdout so the hosted job log carries it:
//   MEASURE: <platform> <id> legacy=<tuple> staged=<tuple>
// `staged` is the app's own route (saveAsCopy off, the shipped preserve defaults); `legacy` is a twin
// of the same fixture, observed the same way, cleaned by the bundled ExifTool with
// -overwrite_original, so OVR-03's comparison against today's behaviour exists on every OS.
// Tuples: readonly = <ok|failed>:<failureKind|->:<mode>:<original|cleaned|other>; the others are a
// single word, documented in tests/smoke/README.md. Every observation also goes into a JSON
// attachment (smoke-report-<os> carries it as a fallback to the log).
//
// Assertions are SAFETY invariants only (no stage or temp residue, the bytes are either the original
// or the cleaned bytes, never lost or half written) plus the POSIX mode expectation. No Windows
// expectation is asserted that has not been measured (D-16): measurements become the notes.
//
// The title does not match the Intel job's --grep; tests/smoke/helpers/intel_grep_isolation.test.ts
// keeps it that way.
import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { RemoveMetadataResult } from "../../src/common/ipc_channels";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";
import { readMetadataTags } from "../e2e/helpers/metadata_assertions";
import { createFixtureDir } from "../helpers/fixture_copier";
import {
	closePackagedApp,
	launchPackagedApp,
} from "./helpers/packaged_launcher";
import type { PackagedLaunchContext } from "./helpers/packaged_launcher";

const execFileAsync = promisify(execFile);

test.describe.configure({ mode: "serial" });

const FIXTURE = "sample.jpg";
// Identifying tags of sample.jpg (measured); a file that has none of them is "cleaned".
const IDENTIFYING = [
	"Make",
	"Model",
	"Artist",
	"GPSLatitude",
	"DateTimeOriginal",
];
const IS_WINDOWS = process.platform === "win32";

type Bytes = "original" | "cleaned" | "other";

interface Probe {
	readonly dir: string;
	readonly original: Buffer;
	cleanup(): void;
}

interface Observation {
	readonly id: string;
	readonly legacy: string;
	readonly staged: string;
}

function octal(mode: number): string {
	return (mode & 0o7777).toString(8).padStart(4, "0");
}

function newProbe(): Probe {
	const { dir, cleanup } = createFixtureDir();
	const original = fs.readFileSync(
		path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"../e2e/fixtures",
			FIXTURE,
		),
	);
	fs.writeFileSync(path.join(dir, "sentinel.txt"), "untouched sibling");
	return {
		dir,
		original,
		cleanup: () => {
			// A read-only attribute or mode would make the recursive removal fail: reopen every entry
			// (directories keep their search bit) before the shared removal.
			for (const entry of walk(dir)) {
				try {
					fs.chmodSync(
						entry,
						fs.lstatSync(entry).isDirectory() ? 0o777 : 0o666,
					);
				} catch {
					// already gone or a dangling link
				}
			}
			cleanup();
		},
	};
}

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		const stat = fs.lstatSync(full);
		if (stat.isSymbolicLink()) continue;
		out.push(full);
		if (stat.isDirectory()) out.push(...walk(full));
	}
	return out;
}

/** Fresh copy of the fixture at `<dir>/<name>`. */
function place(probe: Probe, subdir: string, name: string): string {
	const folder = path.join(probe.dir, subdir);
	fs.mkdirSync(folder, { recursive: true });
	const target = path.join(folder, name);
	fs.writeFileSync(target, probe.original);
	return target;
}

async function bytesState(
	context: PackagedLaunchContext,
	probe: Probe,
	file: string,
): Promise<Bytes> {
	const bytes = fs.readFileSync(file);
	if (bytes.equals(probe.original)) return "original";
	const tags = Object.keys(await readMetadataTags(file, context.exiftoolPath));
	return IDENTIFYING.some((name) => tags.includes(name)) ? "other" : "cleaned";
}

function residue(dir: string): string[] {
	return fs
		.readdirSync(dir)
		.filter(
			(name) =>
				name.startsWith(".exifcleaner-stage-") ||
				name.includes("_exiftool_tmp") ||
				name.endsWith("_original"),
		);
}

async function applyShippedDefaults(
	context: PackagedLaunchContext,
): Promise<void> {
	const response = await context.window.evaluate(
		(next) => globalThis.window.api.settings.set(next),
		{
			preserveOrientation: DEFAULT_SETTINGS.preserveOrientation,
			preserveColorProfile: DEFAULT_SETTINGS.preserveColorProfile,
			preserveResolution: DEFAULT_SETTINGS.preserveResolution,
			removeXattrs: DEFAULT_SETTINGS.removeXattrs,
			preserveTimestamps: DEFAULT_SETTINGS.preserveTimestamps,
			saveAsCopy: false,
		},
	);
	expect(response).toEqual({ success: true, error: null });
}

function staged(
	context: PackagedLaunchContext,
	filePath: string,
): Promise<RemoveMetadataResult> {
	return context.window.evaluate(
		(target) => globalThis.window.api.exif.removeMetadata(target),
		filePath,
	);
}

/** The route the app used before 4.8.0 for every overwrite: ExifTool with -overwrite_original. */
async function legacy(
	context: PackagedLaunchContext,
	filePath: string,
): Promise<boolean> {
	try {
		await execFileAsync(context.exiftoolPath, [
			"-all=",
			"-overwrite_original",
			filePath,
		]);
		return true;
	} catch {
		return false;
	}
}

function failureKind(result: RemoveMetadataResult): string {
	if (result.success) return "-";
	return "failureKind" in result ? result.failureKind : "error";
}

test("installed artifact overwrite platform behaviour is measured and fails closed", async () => {
	const context = await launchPackagedApp();
	const probe = newProbe();
	const observations: Observation[] = [];
	const problems: string[] = [];
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	function record(observation: Observation): void {
		observations.push(observation);
		console.log(
			`MEASURE: ${process.platform} ${observation.id} legacy=${observation.legacy} staged=${observation.staged}`,
		);
	}
	function skipped(id: string, reason: string): void {
		record({ id, legacy: `skipped:${reason}`, staged: `skipped:${reason}` });
	}
	async function guarded(id: string, body: () => Promise<void>): Promise<void> {
		try {
			await body();
		} catch (error) {
			problems.push(
				`${id}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	function assertNoResidue(id: string, dir: string): void {
		const left = residue(dir);
		if (left.length > 0) problems.push(`${id}: residue ${left.join(",")}`);
	}

	try {
		await applyShippedDefaults(context);

		// (1) POSIX mode 0640 is kept (M-05); Windows only has the read-only attribute.
		if (IS_WINDOWS) {
			skipped("mode", "posix-only");
		} else {
			await guarded("mode", async () => {
				const file = place(probe, "mode-staged", "row.jpg");
				const twin = place(probe, "mode-legacy", "row.jpg");
				fs.chmodSync(file, 0o640);
				fs.chmodSync(twin, 0o640);
				const result = await staged(context, file);
				await legacy(context, twin);
				const stagedMode = octal(fs.statSync(file).mode);
				record({
					id: "mode",
					legacy: octal(fs.statSync(twin).mode),
					staged: stagedMode,
				});
				if (!result.success) problems.push("mode: removal failed");
				if (stagedMode !== "0640") {
					problems.push(`mode: staged mode ${stagedMode}, expected 0640`);
				}
				assertNoResidue("mode", path.dirname(file));
			});
		}

		// (2) read-only source in a writable directory (M-02). Measured, safety-only assertions.
		await guarded("readonly", async () => {
			const file = place(probe, "readonly-staged", "row.jpg");
			const twin = place(probe, "readonly-legacy", "row.jpg");
			fs.chmodSync(file, 0o444);
			fs.chmodSync(twin, 0o444);
			const result = await staged(context, file);
			const legacyOk = await legacy(context, twin);
			const stagedBytes = await bytesState(context, probe, file);
			const legacyBytes = await bytesState(context, probe, twin);
			record({
				id: "readonly",
				legacy: `${legacyOk ? "ok" : "failed"}:-:${octal(fs.statSync(twin).mode)}:${legacyBytes}`,
				staged: `${result.success ? "ok" : "failed"}:${failureKind(result)}:${octal(fs.statSync(file).mode)}:${stagedBytes}`,
			});
			if (stagedBytes === "other") problems.push("readonly: bytes are other");
			if (!result.success && stagedBytes !== "original") {
				problems.push("readonly: failed removal changed the source");
			}
			if (result.success && stagedBytes !== "cleaned") {
				problems.push("readonly: successful removal did not clean the source");
			}
			assertNoResidue("readonly", path.dirname(file));
			expect(fs.readdirSync(path.dirname(file))).toEqual(["row.jpg"]);
		});

		// (3) hard link (M-03): rename replaces the directory entry, so the other link keeps old bytes.
		await guarded("hardlink", async () => {
			const file = place(probe, "hardlink-staged", "row.jpg");
			const twin = place(probe, "hardlink-legacy", "row.jpg");
			const link = path.join(path.dirname(file), "link.jpg");
			const twinLink = path.join(path.dirname(twin), "link.jpg");
			fs.linkSync(file, link);
			fs.linkSync(twin, twinLink);
			const result = await staged(context, file);
			await legacy(context, twin);
			const stagedOther = fs.readFileSync(link).equals(probe.original)
				? "unchanged"
				: "changed";
			const legacyOther = fs.readFileSync(twinLink).equals(probe.original)
				? "unchanged"
				: "changed";
			record({
				id: "hardlink",
				legacy: `nlink=${fs.statSync(twin).nlink}:other-link=${legacyOther}`,
				staged: `nlink=${fs.statSync(file).nlink}:other-link=${stagedOther}`,
			});
			if (!result.success) problems.push("hardlink: removal failed");
			if ((await bytesState(context, probe, file)) !== "cleaned") {
				problems.push("hardlink: overwritten file is not cleaned");
			}
			assertNoResidue("hardlink", path.dirname(file));
		});

		// (4) NTFS alternate data stream (M-04), Windows only.
		if (!IS_WINDOWS) {
			skipped("ads", "windows-only");
		} else {
			await guarded("ads", async () => {
				const file = place(probe, "ads-staged", "row.jpg");
				const twin = place(probe, "ads-legacy", "row.jpg");
				fs.writeFileSync(`${file}:exifcleaner-probe`, "probe");
				fs.writeFileSync(`${twin}:exifcleaner-probe`, "probe");
				const result = await staged(context, file);
				await legacy(context, twin);
				const carried = (target: string): string => {
					try {
						return fs.readFileSync(`${target}:exifcleaner-probe`, "utf8") ===
							"probe"
							? "carried"
							: "changed";
					} catch {
						return "dropped";
					}
				};
				record({
					id: "ads",
					legacy: carried(twin),
					staged: carried(file),
				});
				if (!result.success) problems.push("ads: removal failed");
				assertNoResidue("ads", path.dirname(file));
			});
		}

		// (5) symlink at the path (POSIX only): the link is replaced by a regular file; the target is
		// the file the legacy route also leaves alone or rewrites; both are measured.
		if (IS_WINDOWS) {
			skipped("symlink", "posix-only");
		} else {
			await guarded("symlink", async () => {
				const run = async (
					subdir: string,
					clean: (linkPath: string) => Promise<unknown>,
				): Promise<string> => {
					const target = place(probe, subdir, "target.jpg");
					const linkPath = path.join(path.dirname(target), "link.jpg");
					fs.symlinkSync(target, linkPath);
					await clean(linkPath);
					const replaced = !fs.lstatSync(linkPath).isSymbolicLink();
					const targetUnchanged = fs
						.readFileSync(target)
						.equals(probe.original);
					return `replaced-by-regular-file=${replaced}:target-bytes=${targetUnchanged ? "unchanged" : "changed"}`;
				};
				let stagedResult: RemoveMetadataResult | undefined;
				const stagedObservation = await run("symlink-staged", async (link) => {
					stagedResult = await staged(context, link);
				});
				const legacyObservation = await run("symlink-legacy", (link) =>
					legacy(context, link),
				);
				record({
					id: "symlink",
					legacy: legacyObservation,
					staged: stagedObservation,
				});
				if (stagedResult?.success !== true) {
					problems.push("symlink: removal failed");
				}
				assertNoResidue("symlink", path.join(probe.dir, "symlink-staged"));
			});
		}

		// (6) identity (M-06): the ino and dev the zero-id rule depends on are non-zero here.
		await guarded("identity", async () => {
			const file = place(probe, "identity", "row.jpg");
			const before = fs.statSync(file, { bigint: true });
			const result = await staged(context, file);
			const after = fs.statSync(file, { bigint: true });
			const word = (value: bigint): string =>
				value === 0n ? "zero" : "nonzero";
			const stamp = (stat: fs.BigIntStats): string =>
				`ino=${word(stat.ino)}:dev=${word(stat.dev)}`;
			record({
				id: "identity",
				legacy: "n/a",
				staged: `before:${stamp(before)}:after:${stamp(after)}`,
			});
			if (!result.success) problems.push("identity: removal failed");
		});

		// (7) ownership (POSIX) and creation time (Windows) of the replaced file, both routes.
		if (IS_WINDOWS) {
			await guarded("birthtime", async () => {
				const file = place(probe, "birth-staged", "row.jpg");
				const twin = place(probe, "birth-legacy", "row.jpg");
				const before = fs.statSync(file).birthtimeMs;
				const twinBefore = fs.statSync(twin).birthtimeMs;
				const result = await staged(context, file);
				await legacy(context, twin);
				const verdict = (a: number, b: number): string =>
					Math.abs(a - b) > 1 ? "changed" : "same";
				record({
					id: "birthtime",
					legacy: verdict(twinBefore, fs.statSync(twin).birthtimeMs),
					staged: verdict(before, fs.statSync(file).birthtimeMs),
				});
				if (!result.success) problems.push("birthtime: removal failed");
			});
		} else {
			await guarded("owner", async () => {
				const file = place(probe, "owner-staged", "row.jpg");
				const twin = place(probe, "owner-legacy", "row.jpg");
				const source = fs.statSync(file);
				const result = await staged(context, file);
				await legacy(context, twin);
				const owner = (stat: fs.Stats): string => `${stat.uid}:${stat.gid}`;
				const stagedOwner = owner(fs.statSync(file));
				record({
					id: "owner",
					legacy: owner(fs.statSync(twin)),
					staged: `${stagedOwner}:source=${owner(source)}`,
				});
				if (!result.success) problems.push("owner: removal failed");
				// Cross-owner behaviour needs privileges the runner does not have: unmeasured.
				if (process.getuid?.() !== 0 && stagedOwner !== owner(source)) {
					problems.push(
						`owner: staged ${stagedOwner}, source ${owner(source)}`,
					);
				}
			});
		}

		await test.info().attach("overwrite-platform-measurements", {
			body: JSON.stringify({ platform: process.platform, observations }),
			contentType: "application/json",
		});
		// The sentinel sibling and every fixture directory stay free of stage residue.
		expect(fs.readFileSync(path.join(probe.dir, "sentinel.txt"), "utf8")).toBe(
			"untouched sibling",
		);
		expect(problems).toEqual([]);
	} finally {
		probe.cleanup();
		await closePackagedApp(context);
	}

	expect(consoleErrors).toEqual([]);
});
