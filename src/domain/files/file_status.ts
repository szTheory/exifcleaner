// Pure domain logic — zero dependencies, zero I/O.
// Per-file processing states for the UI.

export enum FileProcessingStatus {
	Pending = "pending",
	Reading = "reading",
	Processing = "processing",
	Complete = "complete",
	Error = "error",
	NoMetadataFound = "no-metadata-found",
}
