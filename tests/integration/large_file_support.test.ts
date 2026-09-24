// D-50 regression lock for ExifTool's `LargeFileSupport` default (on since ExifTool 12.88,
// 2024-07-11 -- see RESEARCH.md Finding 1 for the corrected version/date). Deliberately
// carries no NC- number and is not registered in the NC ledger
// (tests/contracts/negative_control_evidence.test.ts), per the Phase 51 D-28 precedent for
// dual-half real-ExifTool proofs that are negative controls in substance but not in the
// numbered ledger. The ~4 GiB output write below is an accepted, bounded cost that criterion
// 3 does not cover -- only the sparse *input* fixture is free.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { OutputTransaction } from "../../src/main/output_transaction";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	FOUR_GIB,
	assertLargeFileHost,
	createSparseLargeMp4,
	sha256OfFileStreamed,
} from "../helpers/large_file_fixture";

// D-50 negative control (Task 3). This constant and class are the ONLY place in the test tree
// that injects `-api LargeFileSupport=0` -- product code (src/) never gains this argument
// (D-48). Measured via Task 2's spike: the write/transaction path surfaces the exact #194 text
// only on stderr (never in ExifToolResult.error, which carries ExifTool's generic
// "0 image files updated" summary instead); the read/inspect path surfaces it through the
// `-G1:2:4`-qualified `ExifTool:Warning` JSON key, which `classifyInspectionDiagnostics`
// treats as fatal for `purpose: "display"`, landing in `inspect()`'s own `error.detail`.
const LARGE_FILE_SUPPORT_DISABLED_ARGS = [
	"-api",
	"LargeFileSupport=0",
] as const;

class LargeFileSupportDisabledProcess extends ExiftoolProcess {
	override async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): ReturnType<ExiftoolProcess["readMetadata"]> {
		return super.readMetadata({
			filePath,
			args: [...LARGE_FILE_SUPPORT_DISABLED_ARGS, ...args],
		});
	}

	override async writeMetadata({
		filePath,
		metadata,
		extraArgs,
	}: {
		filePath: string;
		metadata: Record<string, unknown>;
		extraArgs: string[];
	}): ReturnType<ExiftoolProcess["writeMetadata"]> {
		return super.writeMetadata({
			filePath,
			metadata,
			extraArgs: [...LARGE_FILE_SUPPORT_DISABLED_ARGS, ...extraArgs],
		});
	}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");
const SAMPLE_MP4 = path.resolve(__dirname, "../e2e/fixtures/sample.mp4");

// Shared by both describe blocks below (the regression lock and the D-52 timeout pin), so it
// lives at module scope rather than nested inside one describe.
function buildOutputTransaction(process: ExiftoolProcess): OutputTransaction {
	const exiftool = new ExifToolAdapter({ process });
	const stripMetadata = new StripMetadataCommand({
		metadataEngine: exiftool,
	});
	const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
		metadataEngine: exiftool,
	});
	return new OutputTransaction({
		stripMetadata,
		verifyGeneratedOutput,
		unlink: fs.promises.unlink,
		rename: fs.promises.rename,
		delay: async (milliseconds) => {
			await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
		},
	});
}

// Windows is refused by assertLargeFileHost (a named, failing precondition), never skipped:
// the fixture relies on POSIX sparse ftruncate and st_blocks, and CI runs vitest only on
// ubuntu-24.04.
describe("Large-file (>4 GiB) support on ExifTool's default (LRG-01, LRG-02)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("cleans a normal MP4 then a >4 GiB MP4 in one -stay_open session with no -api argument", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-"));
		temporaryDirs.push(dir);
		assertLargeFileHost({ dir: os.tmpdir() });

		const normalSource = path.join(dir, "normal.mp4");
		fs.copyFileSync(SAMPLE_MP4, normalSource);

		const largeSource = path.join(dir, "large.mp4");
		createSparseLargeMp4({ destination: largeSource });
		const largeSourceDigestBefore = sha256OfFileStreamed({
			filePath: largeSource,
		});

		const before = snapshotDir(dir);

		const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const adapter = new ExifToolAdapter({ process: exiftoolProcess });
		const transaction = buildOutputTransaction(exiftoolProcess);

		const normalGeneratedPath = path.join(dir, "normal_cleaned.mp4");
		const largeGeneratedPath = path.join(dir, "large_cleaned.mp4");

		await exiftoolProcess.open();
		let normalInspect: Awaited<ReturnType<typeof adapter.inspect>>;
		let normalResult: Awaited<ReturnType<typeof transaction.execute>>;
		let largeInspect: Awaited<ReturnType<typeof adapter.inspect>>;
		let largeResult: Awaited<ReturnType<typeof transaction.execute>>;
		try {
			normalInspect = await adapter.inspect({
				source: normalSource,
				purpose: "display",
			});
			expect(normalInspect.ok).toBe(true);

			normalResult = await transaction.execute({
				filePath: normalSource,
				generatedPath: normalGeneratedPath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(normalResult).toEqual({
				ok: true,
				value: { outputPath: normalGeneratedPath },
			});

			largeInspect = await adapter.inspect({
				source: largeSource,
				purpose: "display",
			});
			expect(largeInspect.ok).toBe(true);

			largeResult = await transaction.execute({
				filePath: largeSource,
				generatedPath: largeGeneratedPath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(largeResult).toEqual({
				ok: true,
				value: { outputPath: largeGeneratedPath },
			});
		} finally {
			await exiftoolProcess.close();
		}

		const allResultsText = JSON.stringify([
			normalInspect,
			normalResult,
			largeInspect,
			largeResult,
		]);
		expect(allResultsText).not.toContain("LargeFileSupport not enabled");

		expect(fs.statSync(largeGeneratedPath).size).toBeGreaterThan(FOUR_GIB);

		expect(sha256OfFileStreamed({ filePath: largeSource })).toBe(
			largeSourceDigestBefore,
		);

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: ["normal_cleaned.mp4", "large_cleaned.mp4"],
			modified: [],
			removed: [],
			unchanged: ["normal.mp4", "large.mp4"],
		});
	}, 180_000);

	it("negative control: injecting -api LargeFileSupport=0 reproduces #194's exact text and fails only the >4 GiB file", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-nc-"));
		temporaryDirs.push(dir);
		assertLargeFileHost({ dir: os.tmpdir() });

		const normalSource = path.join(dir, "normal.mp4");
		fs.copyFileSync(SAMPLE_MP4, normalSource);

		const largeSource = path.join(dir, "large.mp4");
		createSparseLargeMp4({ destination: largeSource });
		const largeSourceDigestBefore = sha256OfFileStreamed({
			filePath: largeSource,
		});

		const before = snapshotDir(dir);

		const exiftoolProcess = new LargeFileSupportDisabledProcess({
			binPath: EXIFTOOL_PATH,
		});
		const adapter = new ExifToolAdapter({ process: exiftoolProcess });
		const transaction = buildOutputTransaction(exiftoolProcess);

		const normalGeneratedPath = path.join(dir, "normal_cleaned.mp4");
		const largeGeneratedPath = path.join(dir, "large_cleaned.mp4");

		const warnLines: string[] = [];
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation((...args: unknown[]) => {
				warnLines.push(args.map((a) => String(a)).join(" "));
			});

		await exiftoolProcess.open();
		let normalResult: Awaited<ReturnType<typeof transaction.execute>>;
		let largeInspect: Awaited<ReturnType<typeof adapter.inspect>>;
		let largeResult: Awaited<ReturnType<typeof transaction.execute>>;
		try {
			normalResult = await transaction.execute({
				filePath: normalSource,
				generatedPath: normalGeneratedPath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(normalResult).toEqual({
				ok: true,
				value: { outputPath: normalGeneratedPath },
			});

			// JSON-warning read channel (Task 2, Q2_READ_TEXT_CHANNEL): the exact
			// text surfaces in the display inspect result's own error.detail.
			largeInspect = await adapter.inspect({
				source: largeSource,
				purpose: "display",
			});
			expect(largeInspect).toEqual({
				ok: false,
				error: {
					code: "engine-error",
					detail:
						"End of processing at large atom (LargeFileSupport not enabled)",
					backend: "exiftool",
				},
			});

			largeResult = await transaction.execute({
				filePath: largeSource,
				generatedPath: largeGeneratedPath,
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				preserveTimestamps: false,
			});
			expect(largeResult).toEqual({
				ok: false,
				error: { code: "write-failed" },
			});

			// stderr channel (Task 2, Q2_WRITE_TEXT_CHANNEL): the write path never
			// surfaces the exact text through ExifToolResult.error, only via the
			// console.warn-routed stderr line. Poll with real timers since the line
			// can arrive asynchronously relative to the rejected/resolved promise.
			const deadline = Date.now() + 5000;
			let found = warnLines.some((line) =>
				line.includes(
					"End of processing at large atom (LargeFileSupport not enabled)",
				),
			);
			while (!found && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				found = warnLines.some((line) =>
					line.includes(
						"End of processing at large atom (LargeFileSupport not enabled)",
					),
				);
			}
			expect(found).toBe(true);
		} finally {
			warnSpy.mockRestore();
			await exiftoolProcess.close();
		}

		expect(sha256OfFileStreamed({ filePath: largeSource })).toBe(
			largeSourceDigestBefore,
		);

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: ["normal_cleaned.mp4"],
			modified: [],
			removed: [],
			unchanged: ["normal.mp4", "large.mp4"],
		});
	}, 180_000);
});


// LRG-03 (53.1): EXIFTOOL_COMMAND_TIMEOUT_MS is now exported directly from
// ExiftoolProcess.ts and used as the fixed read/verification deadline; a write command gets
// a per-command, size-scaled deadline instead (writeDeadlineMs, D-57). This remains a literal
// test-only copy rather than an import, so the constant-drift test below keeps proving the
// source text underneath this pin has not silently changed.
const PRODUCT_COMMAND_TIMEOUT_MS = 30_000;

/** Polls a macrotask at a time until `condition()` is true, bounded by real wall-clock time. */
async function pollUntil({
	condition,
	label,
	timeoutMs,
}: {
	condition: () => boolean;
	label: string;
	timeoutMs: number;
}): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error(`${label} never happened`);
		}
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
}

const DEADLINE_RECOVERY_MODES = [
	{
		mode: "overwrite-mode",
		generatedPathName: ".large.exifcleaner-stage-test.mp4",
		useCommitPath: true,
	},
	{
		mode: "copy-mode",
		generatedPathName: "large_cleaned.mp4",
		useCommitPath: false,
	},
] as const;

describe("ExifTool command deadline recovery (LRG-03)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		vi.useRealTimers();
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("the product timeout constant is still 30000 ms", () => {
		const source = fs.readFileSync(
			path.resolve(
				__dirname,
				"../../src/infrastructure/exiftool/ExiftoolProcess.ts",
			),
			"utf8",
		);
		expect(source).toMatch(/const EXIFTOOL_COMMAND_TIMEOUT_MS = 30000;/);
	});

	it.each(DEADLINE_RECOVERY_MODES)(
		"deadline recovery: a >4 GiB $mode staged write past its write deadline is stopped, its partial output is removed, the source is unchanged, and the queued next-file read succeeds on a fresh ExifTool session",
		async ({ generatedPathName, useCommitPath }) => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "large-file-deadline-"),
			);
			temporaryDirs.push(dir);
			assertLargeFileHost({ dir: os.tmpdir() });

			const normalSource = path.join(dir, "normal.mp4");
			fs.copyFileSync(SAMPLE_MP4, normalSource);

			const largeSource = path.join(dir, "large.mp4");
			createSparseLargeMp4({ destination: largeSource });
			const largeSourceDigestBefore = sha256OfFileStreamed({
				filePath: largeSource,
			});

			const generatedPath = path.join(dir, generatedPathName);
			const commitPath = useCommitPath ? largeSource : undefined;

			const before = snapshotDir(dir);

			const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const adapter = new ExifToolAdapter({ process: exiftoolProcess });
			const transaction = buildOutputTransaction(exiftoolProcess);

			let unhandledRejectionCount = 0;
			const onUnhandledRejection = (): void => {
				unhandledRejectionCount += 1;
			};
			process.on("unhandledRejection", onUnhandledRejection);

			await exiftoolProcess.open();
			const firstPid = exiftoolProcess.pid;
			if (firstPid === undefined) {
				throw new Error(
					"Expected ExifTool to report a pid immediately after open()",
				);
			}

			try {
				let pendingWrite: ReturnType<typeof transaction.execute>;
				let pendingRead: ReturnType<typeof adapter.inspect>;
				try {
					// Fake timers must be installed BEFORE the call that schedules the
					// real setTimeout (ExiftoolProcess.ts pump()), not after -- fake
					// timers do not capture timers already pending at install time
					// (53-01-SUMMARY.md Task 2 spike, Q1_TIMER_REGISTERED_AFTER_TURNS=0).
					vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

					// Started, not awaited: this is the >4 GiB staged write, and the
					// FIRST (and only) command of this fresh -stay_open session.
					pendingWrite = transaction.execute({
						filePath: largeSource,
						generatedPath,
						commitPath,
						preserveOrientation: true,
						preserveColorProfile: true,
						preserveResolution: true,
						preserveTimestamps: false,
					});

					// Polling both the timer count and the generated file's existence
					// makes the later "generatedPath is absent" assertion
					// non-vacuous: the file really was created before it was removed.
					await pollUntil({
						condition: () =>
							vi.getTimerCount() === 1 && fs.existsSync(generatedPath),
						label:
							"the staged write's command timer and its generated file",
						timeoutMs: 60_000,
					});

					// The renderer's sequential per-file loop means a display read of
					// the next file is what the queue sends next (D-58's FIFO): it
					// must queue behind the in-flight write with no timer of its own.
					pendingRead = adapter.inspect({
						source: normalSource,
						purpose: "display",
					});

					for (let turn = 0; turn < 20; turn += 1) {
						await new Promise<void>((resolve) => setImmediate(resolve));
					}
					expect(vi.getTimerCount()).toBe(1);

					const size = fs.statSync(largeSource).size;
					const deadline = 30_000 + Math.ceil((size * 1000) / 20_000_000);
					await vi.advanceTimersByTimeAsync(deadline);

					const writeResult = await pendingWrite;
					expect(writeResult).toEqual({
						ok: false,
						error: { code: "write-failed", timedOut: true },
					});

					const readResult = await pendingRead;
					expect(readResult).toEqual({
						ok: true,
						value: {
							metadata: expect.objectContaining({
								"Audio:Artist": "Test Author",
								"Audio:Title": "Test Video",
							}),
							recordCount: 1,
							verification: {},
						},
					});

					expect(exiftoolProcess.pid).toBeDefined();
					expect(exiftoolProcess.pid).not.toBe(firstPid);
					expect(() => process.kill(firstPid, 0)).toThrow();
				} finally {
					vi.useRealTimers();
				}
			} finally {
				await exiftoolProcess.close();
				process.removeListener("unhandledRejection", onUnhandledRejection);
			}

			expect(fs.existsSync(generatedPath)).toBe(false);
			expect(sha256OfFileStreamed({ filePath: largeSource })).toBe(
				largeSourceDigestBefore,
			);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [],
				modified: [],
				removed: [],
				unchanged: ["normal.mp4", "large.mp4"],
			});

			expect(unhandledRejectionCount).toBe(0);
		},
		180_000,
	);
});
