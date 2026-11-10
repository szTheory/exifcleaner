import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	OutputTransaction,
	type OutputTransactionDependencies,
} from "../../src/main/output_transaction";
import {
	statSourceIdentity,
	syncFileToDisk,
} from "../../src/main/source_identity";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

// Real files, real unlink/rename/statSource/syncFile. Only the engine (a copy plus a marker)
// and the verifier (passes, then runs a hook that mutates the world) are doubles. Every case
// asserts the whole directory, not only the source (a check that inspects something adjacent
// is the failure class these tests exist to avoid).

const ORIGINAL = "original bytes of the user's photo";
const MARKER = "-CLEANED";
const temporaryDirs: string[] = [];

afterEach(() => {
	for (const dir of temporaryDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function sha256(file: string): string {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

type Overrides = Partial<
	Pick<OutputTransactionDependencies, "syncFile" | "rename">
>;

function setup({
	onVerified,
	overrides = {},
}: {
	onVerified?: (paths: { source: string; dir: string }) => void;
	overrides?: Overrides;
}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "output-tx-identity-"));
	temporaryDirs.push(dir);
	const source = path.join(dir, "photo.bin");
	const sentinel = path.join(dir, "sentinel.txt");
	const generatedPath = path.join(dir, ".photo.exifcleaner-stage-test.bin");
	fs.writeFileSync(source, ORIGINAL);
	fs.writeFileSync(sentinel, "must not be touched");
	let stripCalls = 0;
	const transaction = new OutputTransaction({
		stripMetadata: {
			execute: async ({ filePath, outputPath }) => {
				stripCalls += 1;
				fs.copyFileSync(filePath, outputPath);
				fs.appendFileSync(outputPath, MARKER);
				return { ok: true, value: { tagsRemoved: 1, writtenBy: "exiftool" } };
			},
		},
		verifyGeneratedOutput: {
			execute: async () => {
				onVerified?.({ source, dir });
				return { ok: true, value: { exemptionsApplied: [] } };
			},
		},
		unlink: fs.promises.unlink,
		rename: overrides.rename ?? fs.promises.rename,
		statSource: statSourceIdentity,
		syncFile: overrides.syncFile ?? syncFileToDisk,
		chown: fs.promises.chown,
		chmod: fs.promises.chmod,
		delay: async () => undefined,
	});
	const run = () =>
		transaction.execute({
			filePath: source,
			generatedPath,
			commitPath: source,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: false,
		});
	return {
		dir,
		source,
		sentinel,
		generatedPath,
		run,
		stripCalls: () => stripCalls,
	};
}

function assertNoStageResidue(dir: string): void {
	const names = fs.readdirSync(dir);
	expect(names.filter((n) => n.includes("exifcleaner-stage"))).toEqual([]);
	expect(names.filter((n) => n.includes("_exiftool_tmp"))).toEqual([]);
}

const COMMIT_FAILED = { ok: false, error: { code: "commit-failed" } };

describe("OutputTransaction over real files: source identity recheck and fsync (69-10)", () => {
	it("negative control: an untouched source commits and the file now holds the cleaned bytes", async () => {
		const ctx = setup({});
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual({ ok: true, value: { outputPath: ctx.source } });
		expect(fs.readFileSync(ctx.source, "utf8")).toBe(ORIGINAL + MARKER);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			modified: ["photo.bin"],
			unchanged: ["sentinel.txt"],
		});
		expect(fs.readFileSync(ctx.sentinel, "utf8")).toBe("must not be touched");
	});

	it("bytes appended to the source between stage and commit: commit-failed, the appended file survives untouched", async () => {
		let shaAfterMutation = "";
		const ctx = setup({
			onVerified: ({ source }) => {
				fs.appendFileSync(source, "-appended-by-a-sync-client");
				shaAfterMutation = sha256(source);
			},
		});
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(fs.readFileSync(ctx.source, "utf8")).toBe(
			`${ORIGINAL}-appended-by-a-sync-client`,
		);
		expect(sha256(ctx.source)).toBe(shaAfterMutation);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			modified: ["photo.bin"],
			unchanged: ["sentinel.txt"],
		});
	});

	it("mtime touched (same bytes) between stage and commit: commit-failed, directory identical to the pre-state", async () => {
		const ctx = setup({
			onVerified: ({ source }) => {
				fs.utimesSync(source, 1_700_000_000, 1_700_000_000);
			},
		});
		const shaBefore = sha256(ctx.source);
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(sha256(ctx.source)).toBe(shaBefore);
		expect(fs.statSync(ctx.source).mtimeMs).toBe(1_700_000_000_000);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			unchanged: ["photo.bin", "sentinel.txt"],
		});
	});

	it("source atomically replaced by identical bytes (new inode): commit-failed, directory identical to the pre-state", async () => {
		const ctx = setup({
			onVerified: ({ source, dir }) => {
				const swap = path.join(dir, "photo.bin.swap");
				fs.writeFileSync(swap, ORIGINAL);
				fs.renameSync(swap, source);
			},
		});
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(fs.readFileSync(ctx.source, "utf8")).toBe(ORIGINAL);
		assertNoStageResidue(ctx.dir);
		expect(fs.readdirSync(ctx.dir).sort()).toEqual(["photo.bin", "sentinel.txt"]);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			unchanged: ["photo.bin", "sentinel.txt"],
		});
	});

	it("source replaced by different bytes: commit-failed, the replacement survives", async () => {
		const ctx = setup({
			onVerified: ({ source, dir }) => {
				const swap = path.join(dir, "photo.bin.swap");
				fs.writeFileSync(swap, "someone else's newer version");
				fs.renameSync(swap, source);
			},
		});
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(fs.readFileSync(ctx.source, "utf8")).toBe(
			"someone else's newer version",
		);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			modified: ["photo.bin"],
			unchanged: ["sentinel.txt"],
		});
	});

	it("source deleted between stage and commit: commit-failed, the stage is removed, nothing is recreated", async () => {
		const ctx = setup({
			onVerified: ({ source }) => {
				fs.rmSync(source);
			},
		});
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(fs.existsSync(ctx.source)).toBe(false);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			removed: ["photo.bin"],
			unchanged: ["sentinel.txt"],
		});
	});

	it("source missing before the transaction starts: commit-failed and the engine is never called", async () => {
		const ctx = setup({});
		fs.rmSync(ctx.source);
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(ctx.stripCalls()).toBe(0);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			unchanged: ["sentinel.txt"],
		});
	});

	it("a sync failure against real unlink: commit-failed, source byte-identical, no stage", async () => {
		const ctx = setup({
			overrides: {
				syncFile: async () => {
					throw Object.assign(new Error("EIO: sync"), { code: "EIO" });
				},
			},
		});
		const shaBefore = sha256(ctx.source);
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(sha256(ctx.source)).toBe(shaBefore);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			unchanged: ["photo.bin", "sentinel.txt"],
		});
	});

	it("a rename failure against real unlink: commit-failed, source byte-identical, no stage", async () => {
		const ctx = setup({
			overrides: {
				rename: async () => {
					throw Object.assign(new Error("EXDEV: rename"), { code: "EXDEV" });
				},
			},
		});
		const shaBefore = sha256(ctx.source);
		const before = snapshotDir(ctx.dir);
		const result = await ctx.run();
		expect(result).toEqual(COMMIT_FAILED);
		expect(sha256(ctx.source)).toBe(shaBefore);
		assertNoStageResidue(ctx.dir);
		assertDirEffect(before, snapshotDir(ctx.dir), {
			unchanged: ["photo.bin", "sentinel.txt"],
		});
	});
});
