// Phase 63-11 (ADP-07; D-03, D-05 #4, D-17): F-HEIC-ICC through the REAL OutputTransaction with
// the real bundled ExifTool and real exifcleaner-node. The exemption is reachable only for
// ExifTool-written HEIF copies (router-set provenance), fails closed the moment provenance
// says native, never leaks across concurrent calls, and QuickTime:HandlerDescription on a real
// encoder file (link-u cavif) still fails closed.
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

const ALL_OFF: Settings = {
	preserveOrientation: false,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: false,
};
const COLOR_ON: Settings = { ...ALL_OFF, preserveColorProfile: true };
// App defaults (matches 63-10): orientation and timestamps kept, colour profile and
// resolution stripped.
const DEFAULTS: Settings = {
	preserveOrientation: true,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: true,
};

const DECLINED_ICC = [
	"sample-sips-icc-declined.heic",
	"sample-sips-icc-declined.avif",
] as const;

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

describe("63-11: F-HEIC-ICC is applied only to ExifTool-written HEIF copies, through the real transaction", () => {
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

	function freshDir(names: readonly string[]): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "heif-icc-tx-"));
		temporaryDirs.push(dir);
		for (const name of names) {
			fs.copyFileSync(path.join(FIXTURES, name), path.join(dir, name));
		}
		return dir;
	}

	type VerifyDependency = ConstructorParameters<
		typeof OutputTransaction
	>[0]["verifyGeneratedOutput"];

	function buildStack({
		flipToNative = false,
	}: { flipToNative?: boolean } = {}) {
		const exiftool = new ExifToolAdapter({ process: exiftoolProcess });
		const native = new NativeMetadataAdapter();
		const hybrid = new HybridMetadataEngine({ exiftool, native });
		const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
		const nativeWrite = vi.spyOn(native, "sanitize");
		const stripMetadata = new StripMetadataCommand({ metadataEngine: hybrid });
		const realQuery = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		const verifySpy = vi.spyOn(realQuery, "execute");
		// Test-only provenance flip: a wrapper around the REAL query that rewrites writtenBy
		// before delegating. No production code can do this (T-63-25).
		const suppliedWrittenBy: (string | undefined)[] = [];
		const verifyGeneratedOutput: VerifyDependency = flipToNative
			? {
					execute: (request) => {
						suppliedWrittenBy.push(request.copyModeLeakCheck?.writtenBy);
						return realQuery.execute({
							...request,
							...(request.copyModeLeakCheck === undefined
								? {}
								: {
										copyModeLeakCheck: {
											...request.copyModeLeakCheck,
											writtenBy: "native",
										},
									}),
						});
					},
				}
			: realQuery;
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
			transaction,
			exiftoolWrite,
			nativeWrite,
			verifySpy,
			suppliedWrittenBy,
		};
	}

	type Stack = ReturnType<typeof buildStack>;

	function copyOnce({
		stack,
		source,
		settings,
	}: {
		stack: Stack;
		source: string;
		settings: Settings;
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
				...settings,
				copyModeLeakCheck: {
					preserveOrientation: settings.preserveOrientation,
					preserveColorProfile: settings.preserveColorProfile,
					preserveResolution: settings.preserveResolution,
				},
			}),
		};
	}

	async function nativeDeclined(stack: Stack): Promise<void> {
		expect(stack.nativeWrite).toHaveBeenCalledOnce();
		const declined = await stack.nativeWrite.mock.results[0]?.value;
		expect(declined.ok).toBe(false);
		// The adapter maps the library decline to code "native-error"; the measured
		// public code (63-06) is nativeCode, with phase "admission" and nativeWrite
		// "not-started" proving nothing was written before the router fell through.
		expect(declined.error.code).toBe("native-error");
		expect(declined.error.nativeCode).toBe("unsupported-format");
		expect(declined.error.phase).toBe("admission");
		expect(declined.error.nativeWrite).toBe("not-started");
	}

	function verifyResultFor(stack: Stack, generatedPath: string) {
		const index = stack.verifySpy.mock.calls.findIndex(
			(call) => call[0]?.generatedPath === generatedPath,
		);
		expect(index).toBeGreaterThanOrEqual(0);
		return stack.verifySpy.mock.results[index]?.value;
	}

	describe("ExifTool provenance publishes under F-HEIC-ICC", () => {
		it.each(DECLINED_ICC)(
			"%s: preserveColorProfile=false is declined by native, written once by ExifTool and published with exemptionsApplied [F-HEIC-ICC]",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const before = snapshotDir(dir);

				const { generatedPath, result } = copyOnce({
					stack,
					source,
					settings: ALL_OFF,
				});
				const outcome = await result;

				expect(outcome).toEqual({
					ok: true,
					value: { outputPath: generatedPath },
				});
				await nativeDeclined(stack);
				expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
				expect(stack.verifySpy).toHaveBeenCalledOnce();
				expect(
					stack.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
				).toBe("exiftool");
				await expect(verifyResultFor(stack, generatedPath)).resolves.toEqual({
					ok: true,
					value: { exemptionsApplied: ["F-HEIC-ICC"] },
				});
				expect(reopenKeys(generatedPath).some(isIccKey)).toBe(true);
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [path.basename(generatedPath)],
					modified: [],
					removed: [],
				});
				expect(
					fs.readdirSync(dir).filter((e) => e.includes("exifcleaner-stage")),
				).toEqual([]);
			},
		);

		it.each(DECLINED_ICC)(
			"%s: preserveColorProfile=true publishes with exemptionsApplied [] (the ICC is permitted, no exemption needed)",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const before = snapshotDir(dir);

				const { generatedPath, result } = copyOnce({
					stack,
					source,
					settings: COLOR_ON,
				});
				const outcome = await result;

				expect(outcome).toEqual({
					ok: true,
					value: { outputPath: generatedPath },
				});
				await nativeDeclined(stack);
				expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
				await expect(verifyResultFor(stack, generatedPath)).resolves.toEqual({
					ok: true,
					value: { exemptionsApplied: [] },
				});
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [name],
					added: [path.basename(generatedPath)],
					modified: [],
					removed: [],
				});
			},
		);
	});

	describe("native provenance never receives the exemption (D-03)", () => {
		it.each(DECLINED_ICC)(
			"%s: the same copy fails closed with output-metadata-leak when provenance reaching verify is native, and nothing is left behind",
			async (name) => {
				const dir = freshDir([name]);
				const source = path.join(dir, name);
				const sourceDigest = sha256(source);
				const stack = buildStack({ flipToNative: true });
				const before = snapshotDir(dir);

				const { generatedPath, result } = copyOnce({
					stack,
					source,
					settings: ALL_OFF,
				});
				const outcome = await result;

				expect(outcome).toEqual({
					ok: false,
					error: {
						code: "verification-failed",
						verificationCode: "output-metadata-leak",
					},
				});
				await nativeDeclined(stack);
				expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
				const verified = await verifyResultFor(stack, generatedPath);
				expect(verified.ok).toBe(false);
				expect(verified.error.code).toBe("output-metadata-leak");
				expect(verified.error.leakedTags.some(isIccKey)).toBe(true);
				// The router really answered exiftool; only the wrapper flipped it to native.
				expect(stack.suppliedWrittenBy).toEqual(["exiftool"]);
				expect(
					stack.verifySpy.mock.calls[0]?.[0]?.copyModeLeakCheck?.writtenBy,
				).toBe("native");
				expect(fs.existsSync(generatedPath)).toBe(false);
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

	describe("concurrent mixed-engine copies share no provenance (ADP-07, D-02)", () => {
		it("an ExifTool-path declined-ICC copy and a native ICC copy run together: only the ExifTool-written one reports F-HEIC-ICC", async () => {
			const names = [
				"sample-sips-icc-declined.heic",
				"sample-sips-icc.heic",
			] as const;
			const dir = freshDir(names);
			const digests = names.map((name) => sha256(path.join(dir, name)));
			const stack = buildStack();
			const before = snapshotDir(dir);

			const runs = names.map((name) =>
				copyOnce({ stack, source: path.join(dir, name), settings: ALL_OFF }),
			);
			const outcomes = await Promise.all(runs.map((run) => run.result));

			outcomes.forEach((outcome, index) => {
				expect(outcome).toEqual({
					ok: true,
					value: { outputPath: runs[index]?.generatedPath },
				});
			});
			expect(stack.nativeWrite).toHaveBeenCalledTimes(2);
			expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
			expect(stack.exiftoolWrite.mock.calls[0]?.[0]?.source).toBe(
				path.join(dir, names[0]),
			);
			expect(stack.verifySpy).toHaveBeenCalledTimes(2);
			const writtenByPath = new Map(
				stack.verifySpy.mock.calls.map((call) => [
					call[0]?.generatedPath,
					call[0]?.copyModeLeakCheck?.writtenBy,
				]),
			);
			expect(writtenByPath.get(runs[0]?.generatedPath as string)).toBe(
				"exiftool",
			);
			expect(writtenByPath.get(runs[1]?.generatedPath as string)).toBe(
				"native",
			);
			await expect(
				verifyResultFor(stack, runs[0]?.generatedPath as string),
			).resolves.toEqual({
				ok: true,
				value: { exemptionsApplied: ["F-HEIC-ICC"] },
			});
			await expect(
				verifyResultFor(stack, runs[1]?.generatedPath as string),
			).resolves.toEqual({ ok: true, value: { exemptionsApplied: [] } });
			names.forEach((name, index) => {
				expect(sha256(path.join(dir, name))).toBe(digests[index]);
			});
			assertDirEffect(before, snapshotDir(dir), {
				unchanged: [...names],
				added: runs.map((run) => path.basename(run.generatedPath)),
				modified: [],
				removed: [],
			});
			expect(
				fs.readdirSync(dir).filter((e) => e.includes("exifcleaner-stage")),
			).toEqual([]);
		});
	});

	describe("HandlerDescription fails closed (D-17)", () => {
		const RED = "red-at-12-oclock-with-color-profile-lossy.avif";

		it.each([
			{ label: "default settings", settings: DEFAULTS },
			{ label: "preserveColorProfile=false (all off)", settings: ALL_OFF },
		])(
			"red.avif with $label goes to ExifTool and fails closed on QuickTime:HandlerDescription",
			async ({ settings }) => {
				const dir = freshDir([RED]);
				const source = path.join(dir, RED);
				const sourceDigest = sha256(source);
				const stack = buildStack();
				const before = snapshotDir(dir);

				const { generatedPath, result } = copyOnce({ stack, source, settings });
				const outcome = await result;

				expect(outcome).toEqual({
					ok: false,
					error: {
						code: "verification-failed",
						verificationCode: "output-metadata-leak",
					},
				});
				expect(stack.nativeWrite).toHaveBeenCalledOnce();
				const declined = await stack.nativeWrite.mock.results[0]?.value;
				expect(declined.ok).toBe(false);
				expect(stack.exiftoolWrite).toHaveBeenCalledOnce();
				const verified = await verifyResultFor(stack, generatedPath);
				expect(verified.ok).toBe(false);
				expect(verified.error.code).toBe("output-metadata-leak");
				expect(verified.error.leakedTags).toContain(
					"QuickTime:HandlerDescription",
				);
				// colourProfile is stripped in both cases, so any ICC residue is exempted
				// (F-HEIC-ICC applies to this ExifTool write) and never listed as a leak.
				expect(verified.error.leakedTags.filter(isIccKey)).toEqual([]);
				expect(fs.existsSync(generatedPath)).toBe(false);
				expect(sha256(source)).toBe(sourceDigest);
				assertDirEffect(before, snapshotDir(dir), {
					unchanged: [RED],
					added: [],
					modified: [],
					removed: [],
				});
			},
		);
	});
});
