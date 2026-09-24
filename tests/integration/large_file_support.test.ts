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
import {
	ExifToolCommandTimeoutError,
	ExiftoolProcess,
	writeDeadlineMs,
} from "../../src/infrastructure/exiftool/ExiftoolProcess";
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


// LRG-03 (53.1): hand-written test literals, never imported from product code -- the
// constant-drift pin test below keeps proving the literal source text underneath these copies
// has not silently changed. writeDeadlineMs itself IS imported for the formula-behavior half
// of that same pin, since a copied formula could silently drift out of step with the real one.
const READ_DEADLINE_MS = 30_000;
const ASSUMED_FLOOR_BYTES_PER_SECOND = 20_000_000;

/**
 * Fails loudly (never skips) on a host without POSIX SIGSTOP/SIGKILL. Windows has neither, so
 * the lifecycle-edge tests below refuse by name rather than through a runner-control skip
 * (verify:known-gaps forbids skipIf/runIf; Phase 53 D-50 precedent).
 */
function assertPosixSignalHost(): void {
	if (process.platform === "win32") {
		throw new Error(
			"Deadline-recovery test precondition failed: POSIX SIGSTOP/SIGKILL are unavailable on win32",
		);
	}
}

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

	it("the command deadline constants and write-deadline formula are pinned (D-57)", () => {
		const source = fs.readFileSync(
			path.resolve(
				__dirname,
				"../../src/infrastructure/exiftool/ExiftoolProcess.ts",
			),
			"utf8",
		);
		expect(source).toMatch(
			/export const EXIFTOOL_COMMAND_TIMEOUT_MS = 30000;/,
		);
		expect(source).toMatch(
			/export const ASSUMED_WRITE_FLOOR_BYTES_PER_SECOND = 20_000_000;/,
		);

		expect(writeDeadlineMs({ sourceBytes: 0 })).toBe(30_000);
		expect(writeDeadlineMs({ sourceBytes: 4_294_971_412 })).toBe(244_749);
		expect(writeDeadlineMs({ sourceBytes: 20_000_000_000_000 })).toBe(
			1_000_030_000,
		);
	});

	it(
		"deadline recovery: a deadline beyond the 2^31-1 ms platform timer limit is chained, not truncated to 1 ms (D-57 no cap)",
		async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-chain-"));
			temporaryDirs.push(dir);
			assertPosixSignalHost();

			const copy = path.join(dir, "sample.mp4");
			fs.copyFileSync(SAMPLE_MP4, copy);
			const outputPath = path.join(dir, "out.mp4");

			const before = snapshotDir(dir);

			const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });

			let unhandledRejectionCount = 0;
			const onUnhandledRejection = (): void => {
				unhandledRejectionCount += 1;
			};
			process.on("unhandledRejection", onUnhandledRejection);

			await exiftoolProcess.open();
			const pid = exiftoolProcess.pid;
			if (pid === undefined) {
				throw new Error(
					"Expected ExifTool to report a pid immediately after open()",
				);
			}

			try {
				process.kill(pid, "SIGSTOP");
				// Fake timers must be installed BEFORE the call that schedules the
				// real setTimeout (ExiftoolProcess.ts's pump()), not after.
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

				const overflowDeadlineMs = 2_147_483_647 + 5_000;
				let settled = false;
				let capturedError: unknown;
				const writePromise = exiftoolProcess
					.writeMetadata({
						filePath: copy,
						metadata: {},
						extraArgs: ["-all=", "-o", outputPath],
						deadlineMs: overflowDeadlineMs,
					})
					.catch((error: unknown) => {
						capturedError = error;
						throw error;
					})
					.finally(() => {
						settled = true;
					});
				// Observed via capturedError/settled below; this keeps the rejection
				// from surfacing as an unhandled rejection while it is in flight.
				writePromise.catch(() => {});

				await pollUntil({
					condition: () => vi.getTimerCount() === 1,
					label: "the overflow deadline's timer",
					timeoutMs: 5000,
				});

				await vi.advanceTimersByTimeAsync(2_147_483_647);
				for (let turn = 0; turn < 20; turn += 1) {
					await new Promise<void>((resolve) => setImmediate(resolve));
				}
				expect(settled).toBe(false);

				await vi.advanceTimersByTimeAsync(5_000);
				await expect(writePromise).rejects.toBeInstanceOf(
					ExifToolCommandTimeoutError,
				);
				expect(settled).toBe(true);
				expect(capturedError).toBeInstanceOf(ExifToolCommandTimeoutError);
				expect(
					(capturedError as ExifToolCommandTimeoutError).deadlineMs,
				).toBe(overflowDeadlineMs);
			} finally {
				vi.useRealTimers();
				await exiftoolProcess.close();
				process.removeListener("unhandledRejection", onUnhandledRejection);
			}

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [],
				modified: [],
				removed: [],
				unchanged: ["sample.mp4"],
			});
			expect(unhandledRejectionCount).toBe(0);
		},
		180_000,
	);

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

	it(
		"deadline recovery: a display read is stopped at exactly 30 s while a >4 GiB write is not stopped until 30 s + size / 20 MB/s (D-57)",
		async () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "large-file-scaled-"),
			);
			temporaryDirs.push(dir);
			assertLargeFileHost({ dir: os.tmpdir() });
			assertPosixSignalHost();

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

			await exiftoolProcess.open();
			const firstPid = exiftoolProcess.pid;
			if (firstPid === undefined) {
				throw new Error(
					"Expected ExifTool to report a pid immediately after open()",
				);
			}

			try {
				// Read half: a display read is stopped at exactly the fixed 30 s
				// deadline, never scaled.
				process.kill(firstPid, "SIGSTOP");
				// Fake timers must be installed BEFORE the call that schedules the
				// real setTimeout (ExiftoolProcess.ts's pump()), not after.
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

				let readSettled = false;
				const readPromise = adapter
					.inspect({ source: normalSource, purpose: "display" })
					.then((result) => {
						readSettled = true;
						return result;
					});

				await pollUntil({
					condition: () => vi.getTimerCount() === 1,
					label: "the display read's deadline timer",
					timeoutMs: 5000,
				});

				await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS - 1);
				for (let turn = 0; turn < 20; turn += 1) {
					await new Promise<void>((resolve) => setImmediate(resolve));
				}
				expect(readSettled).toBe(false);

				await vi.advanceTimersByTimeAsync(1);
				const readResult = await readPromise;
				expect(readResult).toEqual({
					ok: false,
					error: {
						code: "engine-error",
						detail:
							"The metadata engine could not inspect the selected file",
						backend: "exiftool",
					},
				});

				await pollUntil({
					condition: () =>
						exiftoolProcess.pid !== undefined &&
						exiftoolProcess.pid !== firstPid,
					label: "the respawned session's pid",
					timeoutMs: 5000,
				});
				const secondPid = exiftoolProcess.pid;
				if (secondPid === undefined) {
					throw new Error("Expected a respawned ExifTool pid");
				}

				// Write half, on the respawned session: the write deadline scales
				// with source size and is not stopped until the D-57 formula's
				// deadline, well past the read's fixed 30 s.
				process.kill(secondPid, "SIGSTOP");

				const largeGeneratedPath = path.join(dir, "large_cleaned.mp4");
				let writeSettled = false;
				const writePromise = adapter
					.sanitize({
						source: largeSource,
						destination: largeGeneratedPath,
						outputMode: "copy",
						preserveOrientation: true,
						preserveColorProfile: true,
						preserveResolution: true,
						preserveTimestamps: false,
					})
					.then((result) => {
						writeSettled = true;
						return result;
					});

				await pollUntil({
					condition: () => vi.getTimerCount() === 1,
					label: "the staged write's deadline timer",
					timeoutMs: 60_000,
				});

				// Hand-written literals, never writeDeadlineMs -- proves the
				// formula against independently computed numbers (D-67).
				const size = fs.statSync(largeSource).size;
				const expected =
					READ_DEADLINE_MS +
					Math.ceil((size * 1000) / ASSUMED_FLOOR_BYTES_PER_SECOND);

				await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
				for (let turn = 0; turn < 20; turn += 1) {
					await new Promise<void>((resolve) => setImmediate(resolve));
				}
				expect(writeSettled).toBe(false);
				expect(exiftoolProcess.pid).toBe(secondPid);

				await vi.advanceTimersByTimeAsync(expected - READ_DEADLINE_MS - 1);
				for (let turn = 0; turn < 20; turn += 1) {
					await new Promise<void>((resolve) => setImmediate(resolve));
				}
				expect(writeSettled).toBe(false);
				expect(exiftoolProcess.pid).toBe(secondPid);

				await vi.advanceTimersByTimeAsync(1);
				const writeResult = await writePromise;
				expect(writeResult).toEqual({
					ok: false,
					error: {
						code: "engine-error",
						detail: "exceeded the write time limit",
						backend: "exiftool",
						confirmedDeadTimeout: true,
					},
				});
			} finally {
				vi.useRealTimers();
				await exiftoolProcess.close();
			}

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
		},
		180_000,
	);

	it("deadline recovery: a deadline that fires after its command already resolved stops nothing (D-59 step 1)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-resolved-"));
		temporaryDirs.push(dir);
		assertPosixSignalHost();

		const normalSource = path.join(dir, "normal.mp4");
		fs.copyFileSync(SAMPLE_MP4, normalSource);

		const before = snapshotDir(dir);

		const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
		const adapter = new ExifToolAdapter({ process: exiftoolProcess });

		let unhandledRejectionCount = 0;
		const onUnhandledRejection = (): void => {
			unhandledRejectionCount += 1;
		};
		process.on("unhandledRejection", onUnhandledRejection);

		await exiftoolProcess.open();
		const pidBefore = exiftoolProcess.pid;
		if (pidBefore === undefined) {
			throw new Error(
				"Expected ExifTool to report a pid immediately after open()",
			);
		}

		try {
			// Fake timers plus a no-op clearTimeout spy make the deadline timer that
			// the resolved read clears (but does not really clear, since clearTimeout
			// is mocked) survive to fire again -- the stale callback under test.
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const clearTimeoutSpy = vi
				.spyOn(globalThis, "clearTimeout")
				.mockImplementation(() => {});

			try {
				const readResult = await adapter.inspect({
					source: normalSource,
					purpose: "display",
				});
				expect(readResult.ok).toBe(true);
				expect(vi.getTimerCount()).toBe(1);

				vi.advanceTimersByTime(30_000);
			} finally {
				clearTimeoutSpy.mockRestore();
				vi.useRealTimers();
			}

			for (let turn = 0; turn < 20; turn += 1) {
				await new Promise<void>((resolve) => setImmediate(resolve));
			}

			expect(exiftoolProcess.pid).toBe(pidBefore);
			expect(() => process.kill(pidBefore, 0)).not.toThrow();

			const secondRead = await adapter.inspect({
				source: normalSource,
				purpose: "display",
			});
			expect(secondRead.ok).toBe(true);
			expect(exiftoolProcess.pid).toBe(pidBefore);
		} finally {
			await exiftoolProcess.close();
			process.removeListener("unhandledRejection", onUnhandledRejection);
		}

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: [],
			modified: [],
			removed: [],
			unchanged: ["normal.mp4"],
		});
		expect(unhandledRejectionCount).toBe(0);
	});

	it(
		"deadline recovery: an unexpected ExifTool exit rejects only the in-flight command, never replays it, and the queued command succeeds on a fresh session (D-60, D-61)",
		async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "large-file-exit-"));
			temporaryDirs.push(dir);
			assertPosixSignalHost();

			const normalSource = path.join(dir, "normal.mp4");
			fs.copyFileSync(SAMPLE_MP4, normalSource);

			const before = snapshotDir(dir);

			const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const adapter = new ExifToolAdapter({ process: exiftoolProcess });

			let unhandledRejectionCount = 0;
			const onUnhandledRejection = (): void => {
				unhandledRejectionCount += 1;
			};
			process.on("unhandledRejection", onUnhandledRejection);

			await exiftoolProcess.open();
			const pidBefore = exiftoolProcess.pid;
			if (pidBefore === undefined) {
				throw new Error(
					"Expected ExifTool to report a pid immediately after open()",
				);
			}

			try {
				const firstRead = await adapter.inspect({
					source: normalSource,
					purpose: "display",
				});
				expect(firstRead.ok).toBe(true);

				process.kill(pidBefore, "SIGSTOP");

				const readA = adapter.inspect({
					source: normalSource,
					purpose: "display",
				});
				const readB = adapter.inspect({
					source: normalSource,
					purpose: "display",
				});

				// Let A's command actually reach the (stopped) process's stdin pipe
				// before killing it, so this genuinely exercises an in-flight command.
				for (let turn = 0; turn < 20; turn += 1) {
					await new Promise<void>((resolve) => setImmediate(resolve));
				}

				process.kill(pidBefore, "SIGKILL");

				const resultA = await readA;
				expect(resultA).toEqual({
					ok: false,
					error: { code: "engine-unavailable", backend: "exiftool" },
				});

				const resultB = await readB;
				expect(resultB).toEqual({
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
				expect(exiftoolProcess.pid).not.toBe(pidBefore);
				expect(() => process.kill(pidBefore, 0)).toThrow();
			} finally {
				await exiftoolProcess.close();
				process.removeListener("unhandledRejection", onUnhandledRejection);
			}

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [],
				modified: [],
				removed: [],
				unchanged: ["normal.mp4"],
			});
			expect(unhandledRejectionCount).toBe(0);
		},
		30_000,
	);

	it(
		"deadline recovery: close() during a deadline kill shares the kill, rejects the timed-out command once, and never respawns (D-61)",
		async () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "large-file-close-kill-"),
			);
			temporaryDirs.push(dir);
			assertPosixSignalHost();

			const normalSource = path.join(dir, "normal.mp4");
			fs.copyFileSync(SAMPLE_MP4, normalSource);

			const before = snapshotDir(dir);

			const exiftoolProcess = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });

			let unhandledRejectionCount = 0;
			const onUnhandledRejection = (): void => {
				unhandledRejectionCount += 1;
			};
			process.on("unhandledRejection", onUnhandledRejection);

			const errorLines: string[] = [];
			const errorSpy = vi
				.spyOn(console, "error")
				.mockImplementation((...args: unknown[]) => {
					errorLines.push(args.map((value) => String(value)).join(" "));
				});

			await exiftoolProcess.open();
			const pidBefore = exiftoolProcess.pid;
			if (pidBefore === undefined) {
				throw new Error(
					"Expected ExifTool to report a pid immediately after open()",
				);
			}

			try {
				process.kill(pidBefore, "SIGSTOP");

				// Fake timers must be installed BEFORE the call that schedules the
				// real setTimeout (ExiftoolProcess.ts's pump()), not after -- fake
				// timers do not capture timers already pending at install time.
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

				let rejectionCount = 0;
				let capturedRejection: unknown;
				const rejectionCapture = exiftoolProcess
					.readMetadata({ filePath: normalSource, args: ["-G1:2:4"] })
					.catch((error: unknown) => {
						rejectionCount += 1;
						capturedRejection = error;
					});

				await pollUntil({
					condition: () => vi.getTimerCount() === 1,
					label: "the read command's deadline timer",
					timeoutMs: 5000,
				});

				// Synchronous: the state is now "killing" and the real process exit
				// event cannot have run yet.
				vi.advanceTimersByTime(30_000);
				const closing = exiftoolProcess.close();
				vi.useRealTimers();

				const closeResult = await closing;
				expect(closeResult).toEqual({ success: true, error: null });

				await rejectionCapture;
				expect(rejectionCount).toBe(1);
				expect(capturedRejection).toBeInstanceOf(ExifToolCommandTimeoutError);

				expect(exiftoolProcess.pid).toBeUndefined();
				expect(() => process.kill(pidBefore, 0)).toThrow();

				await expect(
					exiftoolProcess.readMetadata({ filePath: normalSource, args: [] }),
				).rejects.toThrow("ExifTool process is not open");

				expect(
					errorLines.some((line) => line.includes("exited unexpectedly")),
				).toBe(false);
			} finally {
				errorSpy.mockRestore();
				process.removeListener("unhandledRejection", onUnhandledRejection);
			}

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [],
				modified: [],
				removed: [],
				unchanged: ["normal.mp4"],
			});
			expect(unhandledRejectionCount).toBe(0);
		},
		30_000,
	);
});
