import { mkdtemp, rm, utimes, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	statSourceIdentity,
	syncFileToDisk,
} from "../../src/main/source_identity";

const temporaryDirs: string[] = [];

async function tempFile(bytes: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "source-identity-"));
	temporaryDirs.push(dir);
	const file = join(dir, "photo.bin");
	await writeFile(file, bytes);
	return file;
}

afterEach(async () => {
	vi.resetModules();
	vi.doUnmock("node:fs/promises");
	for (const dir of temporaryDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

describe("statSourceIdentity (D-11, D-12)", () => {
	it("returns bigint dev, ino, size and mtimeNs plus numeric mode, uid and gid of a real file", async () => {
		const file = await tempFile("twelve bytes");
		const identity = await statSourceIdentity(file);

		expect(typeof identity.dev).toBe("bigint");
		expect(typeof identity.ino).toBe("bigint");
		expect(identity.size).toBe(12n);
		expect(typeof identity.mtimeNs).toBe("bigint");
		expect(identity.mtimeNs > 0n).toBe(true);
		expect(typeof identity.mode).toBe("number");
		expect(typeof identity.uid).toBe("number");
		expect(typeof identity.gid).toBe("number");
		const zero = (value: bigint): string => (value === 0n ? "zero" : "nonzero");
		// M-06 / M-07: one stable observation per platform for the first CI run.
		console.log(
			`MEASURE: ${process.platform} identity ino=${zero(identity.ino)} dev=${zero(identity.dev)} mtimeNs-nonzero=${identity.mtimeNs !== 0n} sync=${await syncFileToDisk(file).then(() => "ok")}`,
		);
	});

	it("mtimeNs reports the exact set time in nanoseconds", async () => {
		const file = await tempFile("x");
		await utimes(file, 1_700_000_000, 1_700_000_000);
		const identity = await statSourceIdentity(file);
		expect(identity.mtimeNs).toBe(1_700_000_000_000_000_000n);
	});

	it("size changes after an append", async () => {
		const file = await tempFile("abc");
		const before = await statSourceIdentity(file);
		await appendFile(file, "def");
		const after = await statSourceIdentity(file);
		expect(before.size).toBe(3n);
		expect(after.size).toBe(6n);
		expect(after.ino).toBe(before.ino);
		expect(after.dev).toBe(before.dev);
	});

	it("mtimeNs changes after utimes while size and ino stay", async () => {
		const file = await tempFile("abc");
		await utimes(file, 1_700_000_000, 1_700_000_000);
		const before = await statSourceIdentity(file);
		await utimes(file, 1_700_000_100, 1_700_000_100);
		const after = await statSourceIdentity(file);
		expect(after.mtimeNs - before.mtimeNs).toBe(100_000_000_000n);
		expect(after.size).toBe(before.size);
		expect(after.ino).toBe(before.ino);
	});

	it("rejects with ENOENT for a missing path", async () => {
		const file = await tempFile("abc");
		await rm(file);
		await expect(statSourceIdentity(file)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});

describe("syncFileToDisk (D-11)", () => {
	it("neither syncing nor reading the identity changes the directory (no stray temp file, bytes equal)", async () => {
		const file = await tempFile("payload");
		const dir = dirname(file);
		const before = snapshotDir(dir);
		await syncFileToDisk(file);
		await statSourceIdentity(file);
		assertDirEffect(before, snapshotDir(dir), { unchanged: ["photo.bin"] });
	});

	it("succeeds on a closed, writable temp file and leaves its bytes alone", async () => {
		const file = await tempFile("payload");
		await expect(syncFileToDisk(file)).resolves.toBeUndefined();
		const after = await statSourceIdentity(file);
		expect(after.size).toBe(7n);
	});

	it("rejects with ENOENT for a missing path", async () => {
		const file = await tempFile("payload");
		await rm(file);
		await expect(syncFileToDisk(file)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("opens the file r+ (Windows FlushFileBuffers needs write access), syncs and closes the handle", async () => {
		const calls: string[] = [];
		vi.resetModules();
		vi.doMock("node:fs/promises", () => ({
			open: async (path: string, flags: string) => {
				calls.push(`open:${path}:${flags}`);
				return {
					sync: async () => {
						calls.push("sync");
					},
					close: async () => {
						calls.push("close");
					},
				};
			},
			stat: async () => {
				throw new Error("not used");
			},
		}));
		const fresh = await import("../../src/main/source_identity");
		await fresh.syncFileToDisk("/virtual/stage.bin");
		expect(calls).toEqual(["open:/virtual/stage.bin:r+", "sync", "close"]);
	});

	it("closes the handle when sync fails and rethrows the sync error", async () => {
		const calls: string[] = [];
		const failure = Object.assign(new Error("EIO: sync"), { code: "EIO" });
		vi.resetModules();
		vi.doMock("node:fs/promises", () => ({
			open: async () => ({
				sync: async () => {
					calls.push("sync");
					throw failure;
				},
				close: async () => {
					calls.push("close");
				},
			}),
			stat: async () => {
				throw new Error("not used");
			},
		}));
		const fresh = await import("../../src/main/source_identity");
		await expect(fresh.syncFileToDisk("/virtual/stage.bin")).rejects.toBe(
			failure,
		);
		expect(calls).toEqual(["sync", "close"]);
	});
});
