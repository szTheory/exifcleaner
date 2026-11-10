import type { Result } from "../common";
import type { ExifError } from "../domain";
import type { CopyModeLeakCheckDemand } from "../domain/files/file_types";
import type { WrittenBy } from "../application/metadata_engine_port";
import type { OutputVerificationError } from "../application/queries/verify_generated_output_query";
import type { SourceIdentity } from "./source_identity";

export type OutputTransactionFailure =
	| {
			readonly code: "write-failed";
			readonly timedOut?: true;
			readonly residualPath?: string;
	  }
	| {
			readonly code: "verification-failed";
			readonly verificationCode: OutputVerificationError["code"];
			/** Tag names (never values or paths) or the fixed verification detail; see verificationDiagnostic. */
			readonly diagnostic?: string;
	  }
	| { readonly code: "cleanup-failed"; readonly residualPath: string }
	| { readonly code: "commit-failed" };

type CopyModeLeakCheck = {
	demand: CopyModeLeakCheckDemand;
	preserveOrientation: boolean;
	preserveColorProfile: boolean;
	preserveResolution: boolean;
};

type StripMetadataRequest = {
	filePath: string;
	outputMode: "copy" | "overwrite";
	preserveOrientation: boolean;
	preserveColorProfile: boolean;
	preserveResolution: boolean;
	preserveTimestamps: boolean;
	saveAsCopy: boolean;
	outputPath: string;
	signal?: AbortSignal | undefined;
};

export type OutputTransactionDependencies = {
	stripMetadata: {
		execute(
			request: StripMetadataRequest,
		): Promise<
			Result<{ tagsRemoved: number; writtenBy: WrittenBy }, ExifError>
		>;
	};
	verifyGeneratedOutput: {
		execute(request: {
			generatedPath: string;
			copyModeLeakCheck?:
				(CopyModeLeakCheck & { writtenBy: WrittenBy }) | undefined;
		}): Promise<
			Result<{ exemptionsApplied: readonly string[] }, OutputVerificationError>
		>;
	};
	unlink(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	/** Identity of the source, captured before the write and rechecked before the rename. */
	statSource(path: string): Promise<SourceIdentity>;
	/** fsync of the closed stage, called after verification and before the recheck. */
	syncFile(path: string): Promise<void>;
	// Declared and wired now, applied by plan 69-11 between the sync and the recheck
	// (never before the sync: syncFile opens the stage r+, which a 0444 stage refuses).
	chown(path: string, uid: number, gid: number): Promise<void>;
	chmod(path: string, mode: number): Promise<void>;
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
		preserveResolution,
		preserveTimestamps,
		signal,
		copyModeLeakCheck,
	}: {
		filePath: string;
		generatedPath: string;
		commitPath?: string | undefined;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveResolution: boolean;
		preserveTimestamps: boolean;
		signal?: AbortSignal | undefined;
		copyModeLeakCheck?: CopyModeLeakCheck | undefined;
	}): Promise<Result<{ outputPath: string }, OutputTransactionFailure>> {
		// Identity is captured only for a staged overwrite, and before the write so a change
		// at any later moment is seen. Nothing exists on disk yet, so a failure needs no cleanup.
		let capturedIdentity: SourceIdentity | undefined;
		if (commitPath !== undefined) {
			try {
				capturedIdentity = await this.dependencies.statSource(filePath);
			} catch {
				return { ok: false, error: { code: "commit-failed" } };
			}
		}

		// The staged write always targets a path distinct from the source
		// (generatedPath), so from the engine's perspective this call is by
		// construction a copy, regardless of whether the transaction ultimately
		// commits back over the original file.
		const writeResult = await this.dependencies.stripMetadata.execute({
			filePath,
			outputMode: "copy",
			preserveOrientation,
			preserveColorProfile,
			preserveResolution,
			preserveTimestamps,
			saveAsCopy: true,
			outputPath: generatedPath,
			signal,
		});
		if (!writeResult.ok) {
			// D-63: cleanup only runs for the confirmed-dead timeout, never for a generic
			// write-failed (D-53 stands) -- the writer's process tree is only known dead
			// in the timeout case, so only that case is safe to unlink.
			if (
				writeResult.error.code === "engine-error" &&
				writeResult.error.confirmedDeadTimeout === true
			) {
				const cleanupFailure = await this.cleanup({ generatedPath });
				if (cleanupFailure === undefined) {
					return { ok: false, error: { code: "write-failed", timedOut: true } };
				}
				// Never propagate cleanup-failed here: its summary says "Couldn't verify
				// cleaned output", which would be false after a confirmed-dead timeout
				// (D-66). Stay on write-failed and disclose the residual path instead.
				return {
					ok: false,
					error: {
						code: "write-failed",
						timedOut: true,
						residualPath: generatedPath,
					},
				};
			}
			return { ok: false, error: { code: "write-failed" } };
		}

		const verificationResult =
			await this.dependencies.verifyGeneratedOutput.execute({
				generatedPath,
				// Provenance is the engine router's answer for THIS write (D-01/D-02); callers
				// supply only the settings part.
				...(copyModeLeakCheck === undefined
					? {}
					: {
							copyModeLeakCheck: {
								...copyModeLeakCheck,
								writtenBy: writeResult.value.writtenBy,
							},
						}),
			});
		if (!verificationResult.ok) {
			const cleanupFailure = await this.cleanup({ generatedPath });
			return {
				ok: false,
				error: cleanupFailure ?? {
					code: "verification-failed",
					verificationCode: verificationResult.error.code,
					diagnostic: verificationDiagnostic(verificationResult.error),
				},
			};
		}

		if (commitPath !== undefined && capturedIdentity !== undefined) {
			try {
				await this.dependencies.syncFile(generatedPath);
				const currentIdentity = await this.dependencies.statSource(filePath);
				if (!sameSourceIdentity(capturedIdentity, currentIdentity)) {
					// The source changed after the stage was written (a sync client, an editor, a
					// replacement). Publishing would overwrite someone else's newer bytes.
					throw new Error("source changed before commit");
				}
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

// size and mtime are always compared. dev and ino only when both captured values are
// non-zero: SMB, FUSE and some ReFS volumes report 0 or ids that are not stable, and a
// false refusal there would make every overwrite fail. ctime is deliberately not compared:
// legitimate metadata operations (chmod, xattr, backup tools) bump it without changing the
// content. Strict bigint equality, no tolerance.
function sameSourceIdentity(
	captured: SourceIdentity,
	current: SourceIdentity,
): boolean {
	if (captured.size !== current.size || captured.mtimeNs !== current.mtimeNs) {
		return false;
	}
	if (
		captured.ino !== 0n &&
		current.ino !== 0n &&
		captured.ino !== current.ino
	) {
		return false;
	}
	if (
		captured.dev !== 0n &&
		current.dev !== 0n &&
		captured.dev !== current.dev
	) {
		return false;
	}
	return true;
}

const MAX_DIAGNOSTIC_TAGS = 8;
const MAX_DIAGNOSTIC_TAG_LENGTH = 80;

// Names only: a leak verdict also reaches this point with the record's values
// nearby, so the text is built from `leakedTags` and `detail` alone. Tag names can
// originate in file content (PNG text keywords, XMP property names), so each name
// and the list are capped; the copied line cannot be flooded by a hostile file.
function verificationDiagnostic(error: OutputVerificationError): string {
	if (error.code === "output-verification-failed") {
		return error.detail;
	}
	if (error.leakedTags.length === 0) {
		return error.detail;
	}
	const shown = error.leakedTags
		.slice(0, MAX_DIAGNOSTIC_TAGS)
		.map((name) =>
			name.length > MAX_DIAGNOSTIC_TAG_LENGTH
				? `${name.slice(0, MAX_DIAGNOSTIC_TAG_LENGTH)}…`
				: name,
		);
	const hidden = error.leakedTags.length - shown.length;
	return hidden > 0 ? `${shown.join(", ")} +${hidden} more` : shown.join(", ");
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
