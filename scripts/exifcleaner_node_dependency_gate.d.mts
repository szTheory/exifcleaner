export const ALLOWED_DRAFT_SHA: string;

export function classifyDependencySpec(spec: unknown): {
	kind:
		"missing" | "file" | "link" | "workspace" | "git" | "registry" | "range";
	exact: boolean;
	fragment?: string;
	version?: string;
};

export function validateDraftDependency(manifest: unknown): readonly string[];
export function validateSealDependency(input: {
	manifest: unknown;
	lockText: string;
	evidence: Record<string, unknown>;
}): readonly string[];

export function validatePackageMetadata(
	packageJson: {
		dependencies?: Record<string, unknown>;
		scripts?: Record<string, unknown>;
	},
	packedPaths?: readonly string[],
): readonly string[];

export function auditInstalledRuntime(packageRoot: string): {
	problems: readonly string[];
	evidence: {
		runtimePaths: readonly string[];
		digests: readonly { path: string; sha256: string }[];
		allowlistedImports: readonly string[];
		zeroForbiddenNetwork: boolean;
	};
};
