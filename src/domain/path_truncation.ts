// Pure domain logic — zero dependencies, zero I/O.
// Middle-truncation for long folder paths, preserving first and last segments.

import type { EscapedSegment } from "./bidi_display_name";

const ELLIPSIS = "\u2026";

interface MiddleTruncatePathParams {
	folderPath: string;
	maxLength: number;
}

type PathFragment =
	| { kind: "slice"; start: number; end: number }
	| { kind: "text"; text: string };

function fragmentText(fragment: PathFragment, folderPath: string): string {
	return fragment.kind === "slice"
		? folderPath.slice(fragment.start, fragment.end)
		: fragment.text;
}

function pathFragments({
	folderPath,
	maxLength,
}: MiddleTruncatePathParams): PathFragment[] {
	if (folderPath.length === 0) return [];
	if (folderPath.length <= maxLength) {
		return [{ kind: "slice", start: 0, end: folderPath.length }];
	}

	// Detect separator (backslash for Windows, forward slash otherwise).
	const separator = folderPath.includes("\\") ? "\\" : "/";
	const parts: { start: number; end: number }[] = [];
	let start = 0;
	for (let index = 0; index <= folderPath.length; index += 1) {
		if (folderPath[index] === separator || index === folderPath.length) {
			if (index > start) parts.push({ start, end: index });
			start = index + 1;
		}
	}

	if (parts.length <= 2) {
		return [{ kind: "slice", start: 0, end: folderPath.length }];
	}

	const first = parts[0]!;
	const last = parts[parts.length - 1]!;
	const trailingSep = folderPath.endsWith(separator) ? separator : "";
	const separatorAndEllipsis = `${separator}${ELLIPSIS}${separator}`;
	const separatorFragment: PathFragment = { kind: "text", text: separator };
	const trailingFragment: PathFragment[] =
		trailingSep === "" ? [] : [{ kind: "text", text: trailingSep }];

	// Try with second-to-last included: first/.../secondToLast/last/.
	const secondToLast = parts[parts.length - 2]!;
	const withSecondToLast: PathFragment[] = [
		{ kind: "slice", ...first },
		{ kind: "text", text: separatorAndEllipsis },
		{ kind: "slice", ...secondToLast },
		separatorFragment,
		{ kind: "slice", ...last },
		...trailingFragment,
	];
	if (
		withSecondToLast
			.map((fragment) => fragmentText(fragment, folderPath))
			.join("").length <= maxLength
	) {
		return withSecondToLast;
	}

	// Minimal: first/.../last/.
	const minimal: PathFragment[] = [
		{ kind: "slice", ...first },
		{ kind: "text", text: separatorAndEllipsis },
		{ kind: "slice", ...last },
		...trailingFragment,
	];
	if (
		minimal.map((fragment) => fragmentText(fragment, folderPath)).join("")
			.length <= maxLength
	) {
		return minimal;
	}

	// If even minimal is too long, still return it (best effort).
	return minimal;
}

export function middleTruncatePath({
	folderPath,
	maxLength,
}: MiddleTruncatePathParams): string {
	return pathFragments({ folderPath, maxLength })
		.map((fragment) => fragmentText(fragment, folderPath))
		.join("");
}

function sliceSegments(
	segments: EscapedSegment[],
	start: number,
	end: number,
): EscapedSegment[] {
	const result: EscapedSegment[] = [];
	let offset = 0;
	for (const segment of segments) {
		const segmentEnd = offset + segment.text.length;
		const from = Math.max(start - offset, 0);
		const to = Math.min(end - offset, segment.text.length);
		if (from < to) {
			result.push({ kind: segment.kind, text: segment.text.slice(from, to) });
		}
		offset = segmentEnd;
	}
	return result;
}

// Truncates the rendered path while retaining which visible tokens came from real bidi
// controls, so literal text such as "<U+202E>" cannot become an escape during rendering.
export function middleTruncatePathSegments({
	segments,
	maxLength,
}: {
	segments: EscapedSegment[];
	maxLength: number;
}): EscapedSegment[] {
	const folderPath = segments.map((segment) => segment.text).join("");
	return pathFragments({ folderPath, maxLength }).flatMap((fragment) =>
		fragment.kind === "slice"
			? sliceSegments(segments, fragment.start, fragment.end)
			: [{ kind: "text" as const, text: fragment.text }],
	);
}
