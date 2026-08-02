export type FileProcessingOutcomeKind =
	| "cleaned"
	| "already-clean"
	| "unchanged"
	| "refused"
	| "failed";

export type FileProcessingRefusal = {
	readonly success: false;
	readonly failureKind: "refused";
	readonly refusalReason: "unsafe-raf-write";
	readonly detail: string;
	readonly originalPath: string;
};

export function refuseUnsafeRafWrite({
	filePath,
}: {
	filePath: string;
}): FileProcessingRefusal {
	return {
		success: false,
		failureKind: "refused",
		refusalReason: "unsafe-raf-write",
		detail:
			"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
		originalPath: filePath,
	};
}

export interface MetadataChangeSummary {
	readonly beforeCount: number;
	readonly afterCount: number;
	readonly removedCount: number;
	readonly stillPresentCount: number;
}

export function summarizeMetadataChange({
	before,
	after,
}: {
	before: Record<string, unknown>;
	after: Record<string, unknown>;
}): MetadataChangeSummary {
	const beforeKeys = Object.keys(before);
	const removedCount = beforeKeys.filter((key) => !(key in after)).length;

	return {
		beforeCount: beforeKeys.length,
		afterCount: Object.keys(after).length,
		removedCount,
		stillPresentCount: beforeKeys.length - removedCount,
	};
}

export function classifyMetadataOutcome({
	beforeCount,
	removedCount,
}: Pick<MetadataChangeSummary, "beforeCount" | "removedCount">): Exclude<
	FileProcessingOutcomeKind,
	"refused" | "failed"
> {
	if (beforeCount === 0) return "already-clean";
	if (removedCount === 0) return "unchanged";
	return "cleaned";
}
