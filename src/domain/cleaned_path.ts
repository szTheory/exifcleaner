// Pure domain logic — generates collision-free output paths for save-as-copy mode.
// No I/O dependencies: uses pure string manipulation for path operations.

export function generateCleanedPath(
	filePath: string,
	exists: (candidate: string) => boolean,
): string {
	// Find the last separator (supports both / and \)
	const lastSep = Math.max(
		filePath.lastIndexOf("/"),
		filePath.lastIndexOf("\\"),
	);
	const dir = lastSep >= 0 ? filePath.slice(0, lastSep) : "";
	const filename = lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;

	// Find extension (last dot in filename)
	const dotIndex = filename.lastIndexOf(".");
	const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";

	const sep = lastSep >= 0 ? filePath[lastSep] : "/";
	const prefix = dir ? `${dir}${sep}` : "";

	let candidate = `${prefix}${base}_cleaned${ext}`;
	let counter = 2;

	while (exists(candidate)) {
		candidate = `${prefix}${base}_cleaned_${counter}${ext}`;
		counter++;
	}

	return candidate;
}
