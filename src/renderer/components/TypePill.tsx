// Color-coded extension badge for the file type column.

/** Maps extension aliases to the canonical CSS modifier class. */
function pillClass(extension: string): string {
	const ext = extension.toLowerCase();

	// Image aliases
	if (ext === "jpeg") return "jpg";
	if (ext === "heif") return "heic";

	// Video aliases — all map to mov
	if (
		ext === "m4v" ||
		ext === "avi" ||
		ext === "mkv" ||
		ext === "3gp" ||
		ext === "wmv"
	)
		return "mov";

	// RAW aliases — all map to dng
	if (
		ext === "cr2" ||
		ext === "cr3" ||
		ext === "nef" ||
		ext === "arw" ||
		ext === "orf" ||
		ext === "rw2" ||
		ext === "raf" ||
		ext === "pef" ||
		ext === "srw"
	)
		return "dng";

	return ext;
}

export function TypePill({
	extension,
}: {
	extension: string;
}): React.JSX.Element {
	const modifier = pillClass(extension);
	return (
		<span className={`type-pill type-pill--${modifier}`}>{extension}</span>
	);
}
