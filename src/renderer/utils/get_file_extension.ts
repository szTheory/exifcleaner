export function getFileExtension(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot === -1 || lastDot === filename.length - 1) return "";
	return filename.substring(lastDot + 1).toUpperCase();
}
