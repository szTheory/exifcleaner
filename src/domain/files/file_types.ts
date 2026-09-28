// Pure domain logic — zero dependencies, zero I/O.
// File extensions accepted by ExifCleaner's verified processing contract.

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
	// Images
	".jpg",
	".jpeg",
	".png",
	".gif",
	".tiff",
	".tif",
	".webp",
	".heic",
	".heif",
	".bmp",
	".avif",
	".svg",
	".cr2",
	".cr3",
	".nef",
	".arw",
	".orf",
	".rw2",
	".raf",
	".dng",
	".pef",
	".srw",
	// Media
	".mp4",
	".mov",
	".avi",
	".m4a",
	".m4v",
	".3gp",
	".wmv",
	// Documents
	".pdf",
]);

export const RAW_EXTENSIONS: ReadonlySet<string> = new Set([
	".raf",
	".cr2",
	".cr3",
	".nef",
	".arw",
	".orf",
	".rw2",
	".dng",
	".pef",
	".srw",
]);

const RAF_EXTENSIONS: ReadonlySet<string> = new Set([".raf"]);

// Deliberately its own set, never folded into the media-format set below (D-11, D-23): that
// set also drives the QuickTime date-removal argument list in the ExifTool adapter, and
// adding webp/png/jpeg to it would change ExifTool's write behavior for those files. Widened
// in 58-04 (ADP-03) from webp-only to webp + png + jpeg -- every format the app can now write
// natively (exifcleaner-node 0.3.0) needs its save-as-copy output independently verified,
// regardless of which engine wrote it.
const VERIFIED_COPY_EXTENSIONS: ReadonlySet<string> = new Set([
	".webp",
	".png",
	".jpg",
	".jpeg",
]);

// Deliberately narrower than VERIFIED_COPY_EXTENSIONS (D-11): the leak check (D-07/D-08) has a
// measured allowlist only for png and jpeg (58-SWEEP-MATRIX.md); webp copies are verified
// (reopened, checked for a recognized FileType/no Error) but not leak-checked -- no allowlist
// was measured for webp in this phase.
const LEAK_CHECKED_COPY_EXTENSIONS: ReadonlySet<string> = new Set([
	".png",
	".jpg",
	".jpeg",
]);

export const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
	".mp4",
	".mov",
	".avi",
	".m4a",
	".m4v",
	".3gp",
	".wmv",
]);

// Deliberately its own set, never folded into the media-format set above (D-23): that set
// also drives the QuickTime date-removal argument list in the ExifTool adapter, and folding
// TIFF in would change ExifTool's write behavior for TIFF files. Exported (unlike webp) so
// the lock test can pin the literal.
export const TIFF_EXTENSIONS: ReadonlySet<string> = new Set([".tif", ".tiff"]);

interface IsSupportedFileParams {
	filename: string;
}

export function isSupportedFile({ filename }: IsSupportedFileParams): boolean {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot === -1) {
		return false;
	}
	const ext = filename.substring(lastDot).toLowerCase();
	return SUPPORTED_EXTENSIONS.has(ext);
}

export function isRawFile({ filename }: IsSupportedFileParams): boolean {
	return hasExtension({ filename, extensions: RAW_EXTENSIONS });
}

export function isRafFile({ filename }: IsSupportedFileParams): boolean {
	return hasExtension({ filename, extensions: RAF_EXTENSIONS });
}

export function isMediaFile({ filename }: IsSupportedFileParams): boolean {
	return hasExtension({ filename, extensions: MEDIA_EXTENSIONS });
}

export function isTiffFile({ filename }: IsSupportedFileParams): boolean {
	return hasExtension({ filename, extensions: TIFF_EXTENSIONS });
}

// A webp/png/jpeg save-as-copy has no independent output verification unless it is
// routed through the staged-write transaction (D-22). In-place webp/png/jpeg
// overwrites stay on the unverified ExifTool path — a deferred gap, not this
// phase's work (D-23, D-24, 47-CONTEXT.md). TIFF routes through the verified
// transaction in BOTH output modes (D-24): this phase changes how TIFF is
// written, and risky/uncertain processing must preserve the source.
// D-11/ADP-03: png and jpeg saves-as-copy are verified alongside webp because
// exifcleaner-node 0.3.0 can write them natively -- every PNG/JPEG copy-mode output,
// regardless of which engine wrote it, must be reopened and checked before publication.
export function requiresVerifiedWrite({
	filename,
	outputMode,
}: {
	filename: string;
	outputMode: "copy" | "overwrite";
}): boolean {
	if (
		isRawFile({ filename }) ||
		isMediaFile({ filename }) ||
		isTiffFile({ filename })
	) {
		return true;
	}
	return (
		outputMode === "copy" &&
		hasExtension({ filename, extensions: VERIFIED_COPY_EXTENSIONS })
	);
}

// D-07/D-08/D-11: whether a save-as-copy's verified reopen should additionally run the
// measured fail-closed leak allowlist (58-SWEEP-MATRIX.md). Narrower than
// requiresVerifiedWrite's copy clause -- only png/jpg/jpeg have a measured allowlist.
export function requiresCopyModeLeakCheck({
	filename,
	outputMode,
}: {
	filename: string;
	outputMode: "copy" | "overwrite";
}): boolean {
	return (
		outputMode === "copy" &&
		hasExtension({ filename, extensions: LEAK_CHECKED_COPY_EXTENSIONS })
	);
}

function hasExtension({
	filename,
	extensions,
}: {
	filename: string;
	extensions: ReadonlySet<string>;
}): boolean {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot === -1) {
		return false;
	}
	const ext = filename.substring(lastDot).toLowerCase();
	return extensions.has(ext);
}
