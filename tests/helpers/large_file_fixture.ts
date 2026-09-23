// D-50 large-file fixture helper. Builds a sparse >4 GiB MP4 by appending a 64-bit `mdat`
// atom to a copy of the small `sample.mp4` fixture, and provides the precondition/sparseness
// gates the regression-lock test relies on. Never use a `free` atom -- CONTEXT.md's probe
// table measured ExifTool refusing to rewrite an oversized `free` atom outright
// ("'free' atom is too large for rewriting"), which is unrelated to LargeFileSupport and
// would falsely fail this fixture. `mdat` is the box ExifTool treats as opaque payload data
// it copies through rather than rewrites.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FOUR_GIB = 4 * 1024 * 1024 * 1024;
export const LARGE_FILE_MARGIN_BYTES = 4096;
export const LARGE_FILE_MIN_FREE_BYTES = 6 * 1024 * 1024 * 1024;
export const MAX_SPARSE_ALLOCATED_BYTES = 64 * 1024 * 1024;

// Filesystem-type magic numbers (POSIX `statfs` `f_type`). Not exposed via
// `fs.constants.statfs` on every platform Node targets here, so these are named constants
// rather than a library lookup.
const TMPFS_MAGIC = 0x01021994;
const RAMFS_MAGIC = 0x858458f6;

const SAMPLE_MP4 = path.resolve(__dirname, "../e2e/fixtures/sample.mp4");

/**
 * Copies `tests/e2e/fixtures/sample.mp4` to `destination`, then appends a 64-bit-sized `mdat`
 * box (ISO-BMFF: size32 sentinel `1`, type `"mdat"`, 8-byte big-endian largesize) and extends
 * the file sparsely via `ftruncateSync` to that atom's declared size. The padding past the
 * 16-byte header is never written -- APFS/ext4 both create a hole via truncate-past-EOF, so
 * the logical size grows past 4 GiB while the allocated blocks stay near zero.
 */
export function createSparseLargeMp4({
	destination,
}: {
	destination: string;
}): {
	logicalBytes: number;
	allocatedBytes: number;
	mdatLargeSize: bigint;
} {
	fs.copyFileSync(SAMPLE_MP4, destination);

	let mdatLargeSize: bigint;
	const fd = fs.openSync(destination, "r+");
	try {
		const currentSize = fs.fstatSync(fd).size;
		const targetTotal = currentSize + FOUR_GIB + LARGE_FILE_MARGIN_BYTES;
		// largesize is the atom's own total size, including its 16-byte header, per ISO-BMFF.
		mdatLargeSize = BigInt(targetTotal - currentSize);

		const header = Buffer.alloc(16);
		header.writeUInt32BE(1, 0); // size32 sentinel: "read largesize next"
		header.write("mdat", 4, "ascii");
		header.writeBigUInt64BE(mdatLargeSize, 8);

		fs.writeSync(fd, header, 0, header.length, currentSize);
		fs.ftruncateSync(fd, targetTotal); // sparse extend -- no real block allocation
	} finally {
		fs.closeSync(fd);
	}

	const stat = fs.statSync(destination);
	const logicalBytes = stat.size;
	const allocatedBytes = stat.blocks * 512;

	assertBeyondFourGiB({ logicalBytes, mdatLargeSize });
	assertSparse({ logicalBytes, allocatedBytes });

	return { logicalBytes, allocatedBytes, mdatLargeSize };
}

/** Throws unless the fixture is strictly beyond the 4 GiB boundary on both measures. */
export function assertBeyondFourGiB({
	logicalBytes,
	mdatLargeSize,
}: {
	logicalBytes: number;
	mdatLargeSize: bigint;
}): void {
	if (!(logicalBytes > FOUR_GIB)) {
		throw new Error(
			`Large-file fixture invariant failed: logicalBytes (${logicalBytes}) must exceed FOUR_GIB (${FOUR_GIB})`,
		);
	}
	if (!(mdatLargeSize > 2n ** 32n)) {
		throw new Error(
			`Large-file fixture invariant failed: mdatLargeSize (${mdatLargeSize}) must exceed 2^32`,
		);
	}
}

/** Throws unless the fixture's allocated blocks stay far below its logical size. */
export function assertSparse({
	logicalBytes,
	allocatedBytes,
}: {
	logicalBytes: number;
	allocatedBytes: number;
}): void {
	// logicalBytes participates in the invariant name/signature (D-50 sparseness gate is
	// stated in terms of both figures) even though only allocatedBytes is compared against
	// the ceiling -- the ceiling itself is chosen to be far below any plausible logical size.
	void logicalBytes;
	if (!(allocatedBytes < MAX_SPARSE_ALLOCATED_BYTES)) {
		throw new Error(
			`Large-file fixture invariant failed: allocatedBytes (${allocatedBytes}) must be below MAX_SPARSE_ALLOCATED_BYTES (${MAX_SPARSE_ALLOCATED_BYTES}) -- the fixture is not sparse`,
		);
	}
}

/**
 * Pure classifier: returns a reason string when the host is unsuitable for a real multi-GiB
 * write, or null when it is fine. `fsType` is compared against the two magic numbers named
 * above; `freeBytes`/`minFreeBytes` are both in bytes.
 */
export function classifyLargeFileHost({
	freeBytes,
	fsType,
	minFreeBytes,
}: {
	freeBytes: number;
	fsType: number;
	minFreeBytes: number;
}): string | null {
	if (freeBytes < minFreeBytes) {
		return `only ${freeBytes} bytes free, need at least ${minFreeBytes}`;
	}
	if (fsType === TMPFS_MAGIC) {
		return "temp directory is tmpfs-backed -- a multi-GiB write could OOM the runner";
	}
	if (fsType === RAMFS_MAGIC) {
		return "temp directory is ramfs-backed -- a multi-GiB write could OOM the runner";
	}
	return null;
}

/** Fails loudly (never skips) when `dir`'s host does not satisfy `classifyLargeFileHost`. */
export function assertLargeFileHost({ dir }: { dir: string }): void {
	const stats = fs.statfsSync(dir);
	const freeBytes = stats.bavail * stats.bsize;
	const reason = classifyLargeFileHost({
		freeBytes,
		fsType: stats.type,
		minFreeBytes: LARGE_FILE_MIN_FREE_BYTES,
	});
	if (reason !== null) {
		throw new Error(`Large-file test precondition failed: ${reason}`);
	}
}

/**
 * Streamed SHA-256 for files that may exceed 2 GiB. `dir_effect.ts`'s `hashFile` uses
 * `fs.readFileSync`, which throws `ERR_FS_FILE_TOO_LARGE` above 2 GiB and falls back to the
 * constant `"unreadable"` digest -- this helper exists so the large-file test can still prove
 * byte-identity of its >4 GiB source.
 */
export function sha256OfFileStreamed({
	filePath,
}: {
	filePath: string;
}): string {
	const CHUNK_SIZE = 8 * 1024 * 1024;
	const hash = createHash("sha256");
	const fd = fs.openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(CHUNK_SIZE);
		let bytesRead: number;
		do {
			bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, null);
			if (bytesRead > 0) {
				hash.update(
					bytesRead === CHUNK_SIZE ? buffer : buffer.subarray(0, bytesRead),
				);
			}
		} while (bytesRead > 0);
	} finally {
		fs.closeSync(fd);
	}
	return hash.digest("hex");
}
