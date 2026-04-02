interface GetFileExtensionParams {
	filename: string;
}

export function getFileExtension({ filename }: GetFileExtensionParams): string {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot === -1 || lastDot === filename.length - 1) return "";
	return filename.substring(lastDot + 1).toUpperCase();
}
