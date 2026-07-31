export interface RevealTargetInput {
	path: string;
	outputPath?: string | undefined;
}

export interface RevealContextPaths {
	cleanedPath: string;
	originalPath: string;
}

export interface RevealTargets {
	primaryPath: string;
	contextPaths: RevealContextPaths | null;
}

export function resolveRevealTargets(file: RevealTargetInput): RevealTargets {
	const primaryPath = file.outputPath ?? file.path;
	const contextPaths =
		primaryPath === file.path
			? null
			: {
					cleanedPath: primaryPath,
					originalPath: file.path,
				};

	return { primaryPath, contextPaths };
}
