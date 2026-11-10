import { open, stat } from "node:fs/promises";

export type SourceIdentity = {
	readonly dev: bigint;
	readonly ino: bigint;
	readonly size: bigint;
	readonly mtimeNs: bigint;
	// Not compared by the identity recheck. The commit applies uid, gid and the mode (masked
	// with 0o7777: this value carries the file-type bits) to the stage so an overwrite keeps
	// the original's attributes.
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
// fails there). A stage written from a read-only source can itself be read-only (the native
// engine gives the stage the source's mode), and r+ then fails with EACCES or EPERM:
// -overwrite_original handles a read-only source, so the sync must not make every such file
// commit-failed. On POSIX fsync works on a read-only descriptor, so only that open is
// retried read-only; any other open error and every sync error still propagate (a Windows
// read-only stage fails closed at the retry's sync, as its rename-over would). No directory
// fsync: the promise is atomic visibility of the rename, not instant durability of the
// directory entry.
export async function syncFileToDisk(path: string): Promise<void> {
	let handle;
	try {
		handle = await open(path, "r+");
	} catch (error: unknown) {
		if (!isPermissionRefusal(error)) {
			throw error;
		}
		handle = await open(path, "r");
	}
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

function isPermissionRefusal(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return false;
	}
	return error.code === "EACCES" || error.code === "EPERM";
}
