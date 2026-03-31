export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const size = bytes / Math.pow(1024, i);
	const unit = units[i];
	if (unit === undefined) return `${bytes} B`;
	return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${unit}`;
}
