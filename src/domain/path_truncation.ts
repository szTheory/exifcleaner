// Pure domain logic — zero dependencies, zero I/O.
// Middle-truncation for long folder paths, preserving first and last segments.

const ELLIPSIS = "\u2026";

interface MiddleTruncatePathParams {
	folderPath: string;
	maxLength: number;
}

export function middleTruncatePath({
	folderPath,
	maxLength,
}: MiddleTruncatePathParams): string {
	if (folderPath.length === 0) return "";
	if (folderPath.length <= maxLength) return folderPath;

	// Detect separator (backslash for Windows, forward slash otherwise)
	const separator = folderPath.includes("\\") ? "\\" : "/";
	const parts = folderPath.split(separator).filter(Boolean);

	if (parts.length <= 2) return folderPath;

	const first = parts[0]!;
	const last = parts[parts.length - 1]!;
	const trailingSep = folderPath.endsWith(separator) ? separator : "";

	// Try with second-to-last included: first/.../secondToLast/last/
	if (parts.length >= 3) {
		const secondToLast = parts[parts.length - 2]!;
		const candidate = `${first}${separator}${ELLIPSIS}${separator}${secondToLast}${separator}${last}${trailingSep}`;
		if (candidate.length <= maxLength) {
			return candidate;
		}
	}

	// Minimal: first/.../last/
	const minimal = `${first}${separator}${ELLIPSIS}${separator}${last}${trailingSep}`;
	if (minimal.length <= maxLength) {
		return minimal;
	}

	// If even minimal is too long, still return it (best effort)
	return minimal;
}
