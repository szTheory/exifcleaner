// Pure domain logic — zero dependencies, zero I/O.
// Supported file extensions that ExifTool can process.

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
	// Videos
	".mp4",
	".mov",
	".avi",
	".mkv",
	".m4v",
	".3gp",
	".wmv",
	// Documents
	".pdf",
]);

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
