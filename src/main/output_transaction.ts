import type { Result } from "../common";
import type { ExifError } from "../domain";
import type { OutputVerificationError } from "../application/queries/verify_generated_output_query";

export type OutputTransactionFailure =
	| { readonly code: "write-failed" }
	| { readonly code: "verification-failed" }
	| { readonly code: "cleanup-failed"; readonly residualPath: string }
	| { readonly code: "commit-failed" };

type StripMetadataRequest = {
	filePath: string;
	preserveOrientation: boolean;
	preserveColorProfile: boolean;
	preserveTimestamps: boolean;
	saveAsCopy: boolean;
	outputPath: string;
	signal?: AbortSignal | undefined;
};

export type OutputTransactionDependencies = {
	stripMetadata: {
		execute(
			request: StripMetadataRequest,
		): Promise<Result<{ tagsRemoved: number }, ExifError>>;
	};
	verifyGeneratedOutput: {
		execute(request: {
			generatedPath: string;
		}): Promise<Result<void, OutputVerificationError>>;
	};
	unlink(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	delay(milliseconds: number): Promise<void>;
};

export class OutputTransaction {
	private readonly dependencies: OutputTransactionDependencies;

	constructor(dependencies: OutputTransactionDependencies) {
		this.dependencies = dependencies;
	}

	async execute({
		filePath,
		generatedPath,
		commitPath,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		signal,
	}: {
		filePath: string;
		generatedPath: string;
		commitPath?: string | undefined;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		signal?: AbortSignal | undefined;
	}): Promise<Result<{ outputPath: string }, OutputTransactionFailure>> {
		const writeResult = await this.dependencies.stripMetadata.execute({
			filePath,
			preserveOrientation,
			preserveColorProfile,
			preserveTimestamps,
			saveAsCopy: true,
			outputPath: generatedPath,
			signal,
		});
		if (!writeResult.ok) {
			return { ok: false, error: { code: "write-failed" } };
		}

		const verificationResult =
			await this.dependencies.verifyGeneratedOutput.execute({
				generatedPath,
			});
		if (!verificationResult.ok) {
			const cleanupFailure = await this.cleanup({ generatedPath });
			return {
				ok: false,
				error: cleanupFailure ?? { code: "verification-failed" },
			};
		}

		if (commitPath !== undefined) {
			try {
				await this.dependencies.rename(generatedPath, commitPath);
			} catch {
				const cleanupFailure = await this.cleanup({ generatedPath });
				return {
					ok: false,
					error: cleanupFailure ?? { code: "commit-failed" },
				};
			}
			return { ok: true, value: { outputPath: commitPath } };
		}

		return { ok: true, value: { outputPath: generatedPath } };
	}

	private async cleanup({
		generatedPath,
	}: {
		generatedPath: string;
	}): Promise<OutputTransactionFailure | undefined> {
		const retryDelays = [20, 50];
		for (let attempt = 0; attempt < retryDelays.length + 1; attempt += 1) {
			try {
				await this.dependencies.unlink(generatedPath);
				return undefined;
			} catch (error: unknown) {
				if (hasCode(error, "ENOENT")) {
					return undefined;
				}
				if (!isTransientFileLock(error) || attempt === retryDelays.length) {
					return { code: "cleanup-failed", residualPath: generatedPath };
				}
				await this.dependencies.delay(retryDelays[attempt]!);
			}
		}

		return { code: "cleanup-failed", residualPath: generatedPath };
	}
}

function isTransientFileLock(error: unknown): boolean {
	return (
		hasCode(error, "EBUSY") ||
		hasCode(error, "EPERM") ||
		hasCode(error, "EACCES")
	);
}

function hasCode(error: unknown, code: string): boolean {
	return isErrorWithCode(error) && error.code === code;
}

function isErrorWithCode(error: unknown): error is { code: unknown } {
	return typeof error === "object" && error !== null && "code" in error;
}
