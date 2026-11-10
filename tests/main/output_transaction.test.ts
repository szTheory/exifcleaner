import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	OutputTransaction,
	type OutputTransactionDependencies,
} from "../../src/main/output_transaction";
import type { SourceIdentity } from "../../src/main/source_identity";

const originalPath = "/tmp/original.mp4";
const generatedPath = "/tmp/.original.exifcleaner-stage.mp4";

type TransactionTestOptions = {
	writeResult?: Awaited<
		ReturnType<OutputTransactionDependencies["stripMetadata"]["execute"]>
	>;
	verifyResult?: Awaited<
		ReturnType<
			OutputTransactionDependencies["verifyGeneratedOutput"]["execute"]
		>
	>;
	unlink?: OutputTransactionDependencies["unlink"];
	rename?: OutputTransactionDependencies["rename"];
	/** Receives the 0-based call index so a test can answer capture and recheck differently. */
	statSource?: (path: string, callIndex: number) => Promise<SourceIdentity>;
	syncFile?: OutputTransactionDependencies["syncFile"];
};

function identity(overrides: Partial<SourceIdentity> = {}): SourceIdentity {
	return {
		dev: 16777230n,
		ino: 8123456n,
		size: 1024n,
		mtimeNs: 1_700_000_000_123_456_789n,
		mode: 0o644,
		uid: 501,
		gid: 20,
		...overrides,
	};
}

// For the cases whose paths never reach the commit branch: the new dependencies are
// required members, but nothing may call them (the plain save-as-copy path).
const neverCalledFileDependencies = {
	statSource: async (): Promise<SourceIdentity> => {
		throw new Error("statSource must not be called on this path");
	},
	syncFile: async (): Promise<void> => {
		throw new Error("syncFile must not be called on this path");
	},
	chown: async (): Promise<void> => {
		throw new Error("chown must not be called on this path");
	},
	chmod: async (): Promise<void> => {
		throw new Error("chmod must not be called on this path");
	},
} satisfies Pick<
	OutputTransactionDependencies,
	"statSource" | "syncFile" | "chown" | "chmod"
>;

function createTransaction({
	writeResult = { ok: true, value: { tagsRemoved: 0, writtenBy: "exiftool" } },
	verifyResult = { ok: true, value: { exemptionsApplied: [] } },
	unlink = async () => undefined,
	rename = async () => undefined,
	statSource = async () => identity(),
	syncFile = async () => undefined,
}: TransactionTestOptions = {}): {
	transaction: OutputTransaction;
	events: string[];
} {
	const events: string[] = [];
	let statCalls = 0;
	const transaction = new OutputTransaction({
		stripMetadata: {
			execute: async () => {
				events.push("write");
				return writeResult;
			},
		},
		verifyGeneratedOutput: {
			execute: async ({ generatedPath: path }) => {
				events.push(`verify:${path}`);
				return verifyResult;
			},
		},
		unlink: async (path) => {
			events.push(`unlink:${path}`);
			return unlink(path);
		},
		rename: async (from, to) => {
			events.push(`rename:${from}:${to}`);
			return rename(from, to);
		},
		statSource: async (path) => {
			events.push(`stat:${path}`);
			const index = statCalls;
			statCalls += 1;
			return statSource(path, index);
		},
		syncFile: async (path) => {
			events.push(`sync:${path}`);
			return syncFile(path);
		},
		// Declared but not applied until plan 69-11: any event here fails the exact lists.
		chown: async (path) => {
			events.push(`chown:${path}`);
		},
		chmod: async (path) => {
			events.push(`chmod:${path}`);
		},
		delay: async (milliseconds) => {
			events.push(`delay:${milliseconds}`);
		},
	});

	return { transaction, events };
}

describe("OutputTransaction", () => {
	it("proves its temporary test workspace has no unaccounted mutations", async () => {
		const directory = await mkdtemp(join(tmpdir(), "output-transaction-"));
		const before = snapshotDir(directory);
		const after = snapshotDir(directory);
		assertDirEffect(before, after, {});
		await rm(directory, { recursive: true, force: true });
	});

	it("writes, verifies the exact output, then returns one publishable success", async () => {
		const { transaction, events } = createTransaction();

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: true, value: { outputPath: generatedPath } });
		expect(events).toEqual(["write", `verify:${generatedPath}`]);
	});

	it("returns write-failed before verification", async () => {
		const { transaction, events } = createTransaction({
			writeResult: {
				ok: false,
				error: { code: "exiftool-error", detail: "write failed" },
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: false, error: { code: "write-failed" } });
		expect(events).toEqual(["write"]);
	});

	it("a confirmed-dead write timeout removes the exact generated path and reports a timed-out write failure (D-63)", async () => {
		const { transaction, events } = createTransaction({
			writeResult: {
				ok: false,
				error: {
					code: "engine-error",
					detail: "exceeded the write time limit",
					backend: "exiftool",
					confirmedDeadTimeout: true,
				},
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: { code: "write-failed", timedOut: true },
		});
		expect(events).toEqual(["write", `unlink:${generatedPath}`]);
	});

	it("a confirmed-dead write timeout whose leftover cannot be removed stays a write failure with the exact residual path (D-66)", async () => {
		const eperm = Object.assign(new Error("locked"), { code: "EPERM" });
		const { transaction, events } = createTransaction({
			writeResult: {
				ok: false,
				error: {
					code: "engine-error",
					detail: "exceeded the write time limit",
					backend: "exiftool",
					confirmedDeadTimeout: true,
				},
			},
			unlink: async () => Promise.reject(eperm),
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "write-failed",
				timedOut: true,
				residualPath: generatedPath,
			},
		});
		expect(events).toEqual([
			"write",
			`unlink:${generatedPath}`,
			"delay:20",
			`unlink:${generatedPath}`,
			"delay:50",
			`unlink:${generatedPath}`,
		]);
	});

	it("an engine error without the confirmed-dead flag never triggers cleanup (D-53, D-63)", async () => {
		const { transaction, events } = createTransaction({
			writeResult: {
				ok: false,
				error: {
					code: "engine-error",
					detail: "exceeded the write time limit",
					backend: "exiftool",
				},
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: false, error: { code: "write-failed" } });
		expect(events).toEqual(["write"]);
	});

	it("cleans the exact generated path before reporting verification-failed", async () => {
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "verification-failed",
				verificationCode: "output-verification-failed",
				diagnostic: "not reopenable",
			},
		});
		expect(result).not.toHaveProperty("outputPath");
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	it("materializes a generated output, verifies only it, then discards it before publishing failure", async () => {
		const fixtureDir = await mkdtemp(join(tmpdir(), "exifcleaner-output-"));
		const sourcePath = join(fixtureDir, "original.mp4");
		const outputPath = join(fixtureDir, "generated.mp4");
		const originalBytes = Buffer.from("preserved original bytes");
		const events: string[] = [];
		await writeFile(sourcePath, originalBytes);

		try {
			const transaction = new OutputTransaction({
				stripMetadata: {
					execute: async ({ outputPath: writtenPath }) => {
						await writeFile(writtenPath, "generated but unreadable bytes");
						events.push(`write:${writtenPath}`);
						return {
							ok: true,
							value: { tagsRemoved: 1, writtenBy: "exiftool" },
						};
					},
				},
				verifyGeneratedOutput: {
					execute: async ({ generatedPath: verifiedPath }) => {
						expect(verifiedPath).toBe(outputPath);
						expect(await readFile(verifiedPath, "utf8")).toContain(
							"unreadable",
						);
						events.push(`verify:${verifiedPath}`);
						return {
							ok: false,
							error: {
								code: "output-verification-failed",
								detail: "re-open failed",
							},
						};
					},
				},
				unlink: async (path) => {
					events.push(`unlink:${path}`);
					await rm(path);
				},
				rename: async () => undefined,
				delay: async () => undefined,
				...neverCalledFileDependencies,
			});

			const result = await transaction.execute({
				filePath: sourcePath,
				generatedPath: outputPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			});
			events.push("result-published");

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
					diagnostic: "re-open failed",
				},
			});
			expect(events).toEqual([
				`write:${outputPath}`,
				`verify:${outputPath}`,
				`unlink:${outputPath}`,
				"result-published",
			]);
			await expect(readFile(outputPath)).rejects.toMatchObject({
				code: "ENOENT",
			});
			expect(
				createHash("sha256")
					.update(await readFile(sourcePath))
					.digest("hex"),
			).toBe(createHash("sha256").update(originalBytes).digest("hex"));
		} finally {
			await rm(fixtureDir, { recursive: true, force: true });
		}
	});

	it("treats ENOENT cleanup as a successful discard", async () => {
		const enoent = Object.assign(new Error("already removed"), {
			code: "ENOENT",
		});
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
			unlink: async () => Promise.reject(enoent),
		});

		await expect(
			transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "verification-failed",
				verificationCode: "output-verification-failed",
				diagnostic: "not reopenable",
			},
		});
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	it("reports the exact residual path after three transient cleanup failures", async () => {
		const eacces = Object.assign(new Error("locked"), { code: "EACCES" });
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
			unlink: async () => Promise.reject(eacces),
		});

		await expect(
			transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: { code: "cleanup-failed", residualPath: generatedPath },
		});
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
			"delay:20",
			`unlink:${generatedPath}`,
			"delay:50",
			`unlink:${generatedPath}`,
		]);
	});

	it("commits a verified stage only after verification", async () => {
		const { transaction, events } = createTransaction();

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			commitPath: originalPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: true, value: { outputPath: originalPath } });
		expect(events).toEqual([
			`stat:${originalPath}`,
			"write",
			`verify:${generatedPath}`,
			`sync:${generatedPath}`,
			`stat:${originalPath}`,
			`rename:${generatedPath}:${originalPath}`,
		]);
	});

	it("cleans a failed commit stage before publishing a terminal failure", async () => {
		const { transaction, events } = createTransaction({
			rename: async () => Promise.reject(new Error("rename failed")),
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			commitPath: originalPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: false, error: { code: "commit-failed" } });
		expect(result).not.toHaveProperty("outputPath");
		expect(events).toEqual([
			`stat:${originalPath}`,
			"write",
			`verify:${generatedPath}`,
			`sync:${generatedPath}`,
			`stat:${originalPath}`,
			`rename:${generatedPath}:${originalPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	describe("staged commit: fsync and source identity recheck (69-10, OVR-02, D-11..D-13)", () => {
		const base = {
			filePath: originalPath,
			generatedPath,
			commitPath: originalPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		};
		const failedCommit = { ok: false, error: { code: "commit-failed" } };
		const throughSync = [
			`stat:${originalPath}`,
			"write",
			`verify:${generatedPath}`,
			`sync:${generatedPath}`,
			`stat:${originalPath}`,
		];

		it("captures identity of the source before the write, then syncs the stage, rechecks, then renames (exact call log)", async () => {
			const { transaction, events } = createTransaction();
			const result = await transaction.execute(base);
			expect(result).toEqual({ ok: true, value: { outputPath: originalPath } });
			expect(events).toEqual([
				`stat:${originalPath}`,
				"write",
				`verify:${generatedPath}`,
				`sync:${generatedPath}`,
				`stat:${originalPath}`,
				`rename:${generatedPath}:${originalPath}`,
			]);
			expect(events.some((e) => /^(chown|chmod):/.test(e))).toBe(false);
		});

		it.each([
			["ino", { ino: 8123457n }],
			["size", { size: 1025n }],
			["mtimeNs", { mtimeNs: 1_700_000_000_123_456_790n }],
			["dev", { dev: 16777231n }],
		] as const)(
			"a different %s at the recheck refuses the commit: rename never called, stage removed",
			async (_field, changed) => {
				const { transaction, events } = createTransaction({
					statSource: async (_path, index) =>
						index === 0 ? identity() : identity(changed),
				});
				const result = await transaction.execute(base);
				expect(result).toEqual(failedCommit);
				expect(result).not.toHaveProperty("outputPath");
				expect(events).toEqual([...throughSync, `unlink:${generatedPath}`]);
				expect(events.some((e) => e.startsWith("rename:"))).toBe(false);
			},
		);

		it("an unchanged identity commits (negative control for the matrix above)", async () => {
			const { transaction, events } = createTransaction({
				statSource: async () => identity({ ino: 42n, dev: 7n }),
			});
			const result = await transaction.execute(base);
			expect(result).toEqual({ ok: true, value: { outputPath: originalPath } });
			expect(events).toContain(`rename:${generatedPath}:${originalPath}`);
		});

		it.each([
			["ino zero at capture", { ino: 0n }, {}, true],
			["ino zero at recheck", {}, { ino: 0n }, true],
			[
				"ino zero at capture, different non-zero at recheck",
				{ ino: 0n },
				{ ino: 99n },
				true,
			],
			[
				"dev zero at capture, different non-zero at recheck",
				{ dev: 0n },
				{ dev: 99n },
				true,
			],
			["dev zero at recheck", {}, { dev: 0n }, true],
			["ino differs, both non-zero", { ino: 5n }, { ino: 6n }, false],
			[
				"ino zero but size differs",
				{ ino: 0n },
				{ ino: 6n, size: 2048n },
				false,
			],
			[
				"ino and dev zero but mtime differs",
				{ ino: 0n, dev: 0n },
				{ ino: 0n, dev: 0n, mtimeNs: 1n },
				false,
			],
		] as const)(
			"zero-id rule (D-12): %s",
			async (_name, captured, rechecked, commits) => {
				const { transaction, events } = createTransaction({
					statSource: async (_path, index) =>
						index === 0 ? identity(captured) : identity(rechecked),
				});
				const result = await transaction.execute(base);
				if (commits) {
					expect(result).toEqual({
						ok: true,
						value: { outputPath: originalPath },
					});
					expect(events).toContain(`rename:${generatedPath}:${originalPath}`);
				} else {
					expect(result).toEqual(failedCommit);
					expect(events.some((e) => e.startsWith("rename:"))).toBe(false);
				}
			},
		);

		it("a failing identity capture returns commit-failed before anything is written, verified, synced or renamed", async () => {
			const { transaction, events } = createTransaction({
				statSource: async () => {
					throw Object.assign(new Error("gone"), { code: "ENOENT" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual(failedCommit);
			expect(events).toEqual([`stat:${originalPath}`]);
		});

		it("a sync failure returns commit-failed: no recheck, no rename, stage removed", async () => {
			const { transaction, events } = createTransaction({
				syncFile: async () => {
					throw Object.assign(new Error("EIO"), { code: "EIO" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual(failedCommit);
			expect(events).toEqual([
				`stat:${originalPath}`,
				"write",
				`verify:${generatedPath}`,
				`sync:${generatedPath}`,
				`unlink:${generatedPath}`,
			]);
		});

		it("a failing recheck stat returns commit-failed with rename never called", async () => {
			const { transaction, events } = createTransaction({
				statSource: async (_path, index) => {
					if (index === 0) return identity();
					throw Object.assign(new Error("gone"), { code: "ENOENT" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual(failedCommit);
			expect(events).toEqual([...throughSync, `unlink:${generatedPath}`]);
		});

		it("a rename failure returns commit-failed and removes the stage after sync and recheck passed", async () => {
			const { transaction, events } = createTransaction({
				rename: async () => {
					throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual(failedCommit);
			expect(events).toEqual([
				...throughSync,
				`rename:${generatedPath}:${originalPath}`,
				`unlink:${generatedPath}`,
			]);
		});

		it("cleanup-failed still wins when the stage cannot be removed after a sync failure (existing precedence)", async () => {
			const { transaction, events } = createTransaction({
				syncFile: async () => {
					throw new Error("sync failed");
				},
				unlink: async () => {
					throw Object.assign(new Error("EIO"), { code: "EIO" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual({
				ok: false,
				error: { code: "cleanup-failed", residualPath: generatedPath },
			});
			expect(events).toEqual([
				`stat:${originalPath}`,
				"write",
				`verify:${generatedPath}`,
				`sync:${generatedPath}`,
				`unlink:${generatedPath}`,
			]);
		});

		it("cleanup-failed still wins over an identity mismatch", async () => {
			const { transaction } = createTransaction({
				statSource: async (_path, index) =>
					index === 0 ? identity() : identity({ size: 1n }),
				unlink: async () => {
					throw Object.assign(new Error("EIO"), { code: "EIO" });
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual({
				ok: false,
				error: { code: "cleanup-failed", residualPath: generatedPath },
			});
		});

		it("a write failure with a commit path only captured identity: no sync, no recheck", async () => {
			const { transaction, events } = createTransaction({
				writeResult: {
					ok: false,
					error: { code: "exiftool-error", detail: "write failed" },
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual({ ok: false, error: { code: "write-failed" } });
			expect(events).toEqual([`stat:${originalPath}`, "write"]);
		});

		it("a verification failure with a commit path never syncs or rechecks", async () => {
			const { transaction, events } = createTransaction({
				verifyResult: {
					ok: false,
					error: { code: "output-verification-failed", detail: "bad" },
				},
			});
			const result = await transaction.execute(base);
			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
					diagnostic: "bad",
				},
			});
			expect(events).toEqual([
				`stat:${originalPath}`,
				"write",
				`verify:${generatedPath}`,
				`unlink:${generatedPath}`,
			]);
		});

		it("without a commit path (plain save as copy) neither statSource nor syncFile is called", async () => {
			const { transaction, events } = createTransaction();
			const result = await transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			});
			expect(result).toEqual({
				ok: true,
				value: { outputPath: generatedPath },
			});
			expect(events).toEqual(["write", `verify:${generatedPath}`]);
		});
	});

	// D-27 NC-8: a webp save-as-copy whose generated output fails ExifTool
	// reopen verification is unlinked, reported as a failure, and leaves the
	// source untouched (T-47-31, T-47-32). Driven against a real temp
	// directory with real bytes so the whole-directory delta and the source's
	// content hash are both asserted against real filesystem effects, not a
	// fake's bookkeeping. Placed here (not exif_handlers.test.ts) because the
	// verification dependency can be made to decline directly, with fewer
	// fakes than driving the handler-level wiring would require.
	it("NC-8: a failed reopen verification unlinks the generated output, reports failure, and leaves the source byte-identical", async () => {
		const fixtureDir = await mkdtemp(join(tmpdir(), "exifcleaner-nc8-"));
		const sourcePath = join(fixtureDir, "sample.webp");
		const outputPath = join(fixtureDir, "sample-cleaned.webp");
		const originalBytes = Buffer.from("original webp bytes, untouched");
		await writeFile(sourcePath, originalBytes);
		const sourceDigestBefore = createHash("sha256")
			.update(originalBytes)
			.digest("hex");

		try {
			const transaction = new OutputTransaction({
				stripMetadata: {
					execute: async ({ outputPath: writtenPath }) => {
						await writeFile(writtenPath, "generated but unverifiable bytes");
						return {
							ok: true,
							value: { tagsRemoved: 1, writtenBy: "exiftool" },
						};
					},
				},
				verifyGeneratedOutput: {
					execute: async ({ generatedPath: verifiedPath }) => {
						expect(verifiedPath).toBe(outputPath);
						return {
							ok: false,
							error: {
								code: "output-verification-failed",
								detail: "reopen failed",
							},
						};
					},
				},
				unlink: async (path) => {
					await rm(path);
				},
				rename: async () => undefined,
				delay: async () => undefined,
				...neverCalledFileDependencies,
			});

			const beforeDir = snapshotDir(fixtureDir);
			const result = await transaction.execute({
				filePath: sourcePath,
				generatedPath: outputPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			});

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
					diagnostic: "reopen failed",
				},
			});
			assertDirEffect(beforeDir, snapshotDir(fixtureDir), {
				added: [],
				modified: [],
				removed: [],
				unchanged: ["sample.webp"],
			});
			const sourceDigestAfter = createHash("sha256")
				.update(await readFile(sourcePath))
				.digest("hex");
			expect(sourceDigestAfter).toBe(sourceDigestBefore);
		} finally {
			await rm(fixtureDir, { recursive: true, force: true });
		}
	});

	// Paired positive control (D-27): without this, NC-8's empty-delta
	// assertion above would pass vacuously against any transaction that never
	// writes anything at all. A successful webp copy must add exactly the
	// generated path and modify nothing.
	it("NC-8: a successful webp copy adds exactly one path and modifies none, with the source unchanged", async () => {
		const fixtureDir = await mkdtemp(join(tmpdir(), "exifcleaner-nc8-ok-"));
		const sourcePath = join(fixtureDir, "sample.webp");
		const outputPath = join(fixtureDir, "sample-cleaned.webp");
		await writeFile(sourcePath, Buffer.from("original webp bytes, untouched"));

		try {
			const transaction = new OutputTransaction({
				stripMetadata: {
					execute: async ({ outputPath: writtenPath }) => {
						await writeFile(writtenPath, "generated and verified bytes");
						return {
							ok: true,
							value: { tagsRemoved: 1, writtenBy: "exiftool" },
						};
					},
				},
				verifyGeneratedOutput: {
					execute: async () => ({ ok: true, value: { exemptionsApplied: [] } }),
				},
				unlink: async (path) => {
					await rm(path);
				},
				rename: async () => undefined,
				delay: async () => undefined,
				...neverCalledFileDependencies,
			});

			const beforeDir = snapshotDir(fixtureDir);
			const result = await transaction.execute({
				filePath: sourcePath,
				generatedPath: outputPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				preserveTimestamps: false,
			});

			expect(result).toEqual({ ok: true, value: { outputPath } });
			assertDirEffect(beforeDir, snapshotDir(fixtureDir), {
				added: ["sample-cleaned.webp"],
				modified: [],
				removed: [],
				unchanged: ["sample.webp"],
			});
		} finally {
			await rm(fixtureDir, { recursive: true, force: true });
		}
	});

	it.each([true, false])(
		"forwards preserveResolution %s to stripMetadata.execute unchanged (FID-01, D-40)",
		async (preserveResolution) => {
			const requests: Array<{ preserveResolution: boolean }> = [];
			const transaction = new OutputTransaction({
				stripMetadata: {
					execute: async (request) => {
						requests.push({ preserveResolution: request.preserveResolution });
						return {
							ok: true,
							value: { tagsRemoved: 0, writtenBy: "exiftool" },
						};
					},
				},
				verifyGeneratedOutput: {
					execute: async () => ({ ok: true, value: { exemptionsApplied: [] } }),
				},
				unlink: async () => undefined,
				rename: async () => undefined,
				delay: async () => undefined,
				...neverCalledFileDependencies,
			});

			await transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution,
				preserveTimestamps: false,
			});

			expect(requests).toEqual([{ preserveResolution }]);
		},
	);

	it("forwards copyModeLeakCheck to verifyGeneratedOutput.execute with the strip result's writtenBy, nothing when omitted", async () => {
		const leakCheck = {
			demand: "when-allowlisted" as const,
			preserveOrientation: true,
			preserveColorProfile: false,
			preserveResolution: true,
		};
		const requests: Array<{
			copyModeLeakCheck:
				| {
						preserveOrientation: boolean;
						preserveColorProfile: boolean;
						preserveResolution: boolean;
						writtenBy: "native" | "exiftool";
				  }
				| undefined;
		}> = [];
		const writtenByQueue: Array<"native" | "exiftool"> = [
			"native",
			"exiftool",
			"native",
		];
		const transaction = new OutputTransaction({
			stripMetadata: {
				execute: async () => ({
					ok: true,
					value: {
						tagsRemoved: 0,
						writtenBy: writtenByQueue.shift() ?? "native",
					},
				}),
			},
			verifyGeneratedOutput: {
				execute: async (request) => {
					requests.push({ copyModeLeakCheck: request.copyModeLeakCheck });
					return { ok: true, value: { exemptionsApplied: [] } };
				},
			},
			unlink: async () => undefined,
			rename: async () => undefined,
			delay: async () => undefined,
			...neverCalledFileDependencies,
		});
		const base = {
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		};

		await transaction.execute({ ...base, copyModeLeakCheck: leakCheck });
		await transaction.execute({ ...base, copyModeLeakCheck: leakCheck });
		await transaction.execute(base);

		expect(requests).toEqual([
			{ copyModeLeakCheck: { ...leakCheck, writtenBy: "native" } },
			{ copyModeLeakCheck: { ...leakCheck, writtenBy: "exiftool" } },
			{ copyModeLeakCheck: undefined },
		]);
	});

	it("a leak verdict unlinks the staged output and reports verification-failed with verificationCode output-metadata-leak", async () => {
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: {
					code: "output-metadata-leak",
					detail:
						"Generated output kept 1 metadata tag(s) outside the permitted set: XMP-dc:Creator",
					leakedTags: ["XMP-dc:Creator"],
				},
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "verification-failed",
				verificationCode: "output-metadata-leak",
				diagnostic: "XMP-dc:Creator",
			},
		});
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	describe("verification diagnostic (69-04, D-20, D-22d)", () => {
		const baseRequest = {
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: false,
		};

		function leakResult(
			leakedTags: readonly string[],
			extra: Record<string, unknown> = {},
		): NonNullable<TransactionTestOptions["verifyResult"]> {
			return {
				ok: false,
				error: {
					code: "output-metadata-leak",
					detail: `Generated output kept ${leakedTags.length} metadata tag(s) outside the permitted set: ${leakedTags.join(", ")}`,
					leakedTags,
					...extra,
				},
			};
		}

		it("carries the leaked tag name of a colour JPEG leak as the diagnostic", async () => {
			const { transaction } = createTransaction({
				verifyResult: leakResult(["File:YCbCrSubSampling"]),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic: "File:YCbCrSubSampling",
				},
			});
		});

		it("carries the fixed verification detail for a non-leak verification failure", async () => {
			const { transaction } = createTransaction({
				verifyResult: {
					ok: false,
					error: {
						code: "output-verification-failed",
						detail: "ExifTool reported an error for the generated output",
					},
				},
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-verification-failed",
					diagnostic: "ExifTool reported an error for the generated output",
				},
			});
		});

		it("lists the first 8 leaked tag names then a +N more suffix", async () => {
			const names = Array.from({ length: 10 }, (_, i) => `ICC-test:Tag${i}`);
			const { transaction } = createTransaction({
				verifyResult: leakResult(names),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic:
						"ICC-test:Tag0, ICC-test:Tag1, ICC-test:Tag2, ICC-test:Tag3, ICC-test:Tag4, ICC-test:Tag5, ICC-test:Tag6, ICC-test:Tag7 +2 more",
				},
			});
		});

		it("lists exactly 8 names with no suffix", async () => {
			const names = Array.from({ length: 8 }, (_, i) => `PNG:Key${i}`);
			const { transaction } = createTransaction({
				verifyResult: leakResult(names),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toMatchObject({
				ok: false,
				error: { diagnostic: names.join(", ") },
			});
		});

		it("falls back to the verifier detail (which names the reopened FileType) when no tag is listed", async () => {
			const { transaction } = createTransaction({
				verifyResult: {
					ok: false,
					error: {
						code: "output-metadata-leak",
						detail:
							"Copy-mode leak check has no permitted-tag set for this file type (WEBP)",
						leakedTags: [],
					},
				},
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic:
						"Copy-mode leak check has no permitted-tag set for this file type (WEBP)",
				},
			});
		});

		it("never carries tag values, however the verifier error is shaped (T-69-09)", async () => {
			const sentinel = "ZZ69-04-SENTINEL-VALUE";
			const { transaction } = createTransaction({
				verifyResult: leakResult(["XMP-dc:Creator", "EXIF:GPSLatitude"], {
					metadata: {
						"XMP-dc:Creator": sentinel,
						"EXIF:GPSLatitude": sentinel,
					},
					record: { "XMP-dc:Creator": sentinel },
				}),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: {
					code: "verification-failed",
					verificationCode: "output-metadata-leak",
					diagnostic: "XMP-dc:Creator, EXIF:GPSLatitude",
				},
			});
			expect(JSON.stringify(result)).not.toContain(sentinel);
			expect(JSON.stringify(result)).not.toContain(generatedPath);
			expect(JSON.stringify(result)).not.toContain(originalPath);
		});

		it("truncates a pathologically long tag name so the line cannot be flooded", async () => {
			const long = `XMP-x:${"A".repeat(500)}`;
			const { transaction } = createTransaction({
				verifyResult: leakResult([long]),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toMatchObject({
				ok: false,
				error: { diagnostic: `${long.slice(0, 80)}…` },
			});
		});

		it("keeps cleanup-failed ahead of the diagnostic when the stage cannot be removed", async () => {
			const eacces = Object.assign(new Error("locked"), { code: "EACCES" });
			const { transaction } = createTransaction({
				verifyResult: leakResult(["File:YCbCrSubSampling"]),
				unlink: async () => Promise.reject(eacces),
			});

			const result = await transaction.execute(baseRequest);

			expect(result).toEqual({
				ok: false,
				error: { code: "cleanup-failed", residualPath: generatedPath },
			});
			expect(JSON.stringify(result)).not.toContain("YCbCrSubSampling");
		});
	});
});
