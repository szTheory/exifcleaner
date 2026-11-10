import { open, stat } from "node:fs/promises";

export type SourceIdentity = {
	readonly dev: bigint;
	readonly ino: bigint;
	readonly size: bigint;
	readonly mtimeNs: bigint;
	// Not compared by the identity recheck. Plan 69-11 applies mode, uid and gid to the stage
	// so an overwrite keeps the original's attributes.
	readonly mode: number;
	readonly uid: number;
	readonly gid: number;
};

// bigint stat: dev, ino and mtime in nanoseconds are exact (a number loses precision on
// 64-bit inodes and on ns timestamps). ctime is deliberately not captured: legitimate
// metadata operations (chmod, xattr, a backup tool) bump it without changing the content.
export async function statSourceIdentity(
	path: string,
): Promise<SourceIdentity> {
	const stats = await stat(path, { bigint: true });
	return {
		dev: stats.dev,
		ino: stats.ino,
		size: stats.size,
		mtimeNs: stats.mtimeNs,
		mode: Number(stats.mode),
		uid: Number(stats.uid),
		gid: Number(stats.gid),
	};
}

// Flush the closed stage to disk before it is renamed over the only copy of the user's
// file. Opened r+ because Windows FlushFileBuffers needs write access (a read-only open
// fails there). No directory fsync: the promise is atomic visibility of the rename, not
// instant durability of the directory entry.
export async function syncFileToDisk(path: string): Promise<void> {
	const handle = await open(path, "r+");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
