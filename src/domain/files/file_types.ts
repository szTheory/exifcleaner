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

// Deliberately its own set, never folded into the media-format set below
// (D-23): that set also drives the QuickTime date-removal argument list in
// the ExifTool adapter, and adding webp to it would change ExifTool's write
// behavior for webp files.
const WEBP_EXTENSIONS: ReadonlySet<string> = new Set([".webp"]);

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

// A webp save-as-copy has no independent output verification unless it is
// routed through the staged-write transaction (D-22). In-place webp
// overwrites stay on the unverified ExifTool path — a deferred gap, not this
// phase's work (D-23, D-24, 47-CONTEXT.md). TIFF routes through the verified
// transaction in BOTH output modes (D-24): this phase changes how TIFF is
// written, and risky/uncertain processing must preserve the source.
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
		hasExtension({ filename, extensions: WEBP_EXTENSIONS })
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
