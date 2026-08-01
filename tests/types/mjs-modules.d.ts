// Ambient module declarations for this repo's plain-Node gate scripts (`scripts/*.mjs`).
//
// These are hand-rolled CLI scripts, not a published package, so they carry no
// declaration file of their own. Importing one from a type-checked Vitest test would
// otherwise be an implicit `any` now that `tests/**` is in the typecheck graph (D-27):
// TypeScript resolves a relative `.mjs` specifier to the real file on disk (this repo
// does not set `allowJs`), finds no types, and reports TS7016 rather than falling back
// to an exact-string `declare module "../../scripts/foo.mjs"` ambient declaration --
// TypeScript only consults the ambient-module table for genuinely unresolvable
// specifiers, and a real `.mjs` file on disk always resolves. A wildcard pattern that
// matches on filename suffix, `declare module "*foo.mjs"`, is resolved as ambient
// *before* the real-file lookup, which is why the blocks below are scoped that way
// instead of by exact relative path.
//
// Each block is scoped to one script's filename suffix, so multiple gate scripts with
// different exports can each get their own explicit signature here without colliding.
// Add one `declare module "*<script-name>.mjs"` block per gate script consumed from a
// type-checked test file -- do not fall back to a whole-file type-checking suppression
// directive, which would hide real type errors in the rest of the test body.

declare module "*gatekeeper_check.mjs" {
	export function classifySpctl(output: string): {
		ok: boolean;
		source?: string;
		reason?: string;
	};
}

declare module "*dir_effect_gate.mjs" {
	export function classifyTestFile(
		source: string,
		filename: string,
	): {
		ok: boolean;
		collected: boolean;
		writesToDisk: boolean;
		reason?: string;
	};
	export function classifyExemptionFreshness(
		relPath: string,
		source: string,
	): {
		stale: boolean;
		reason?: string;
	};
}

declare module "*release_notes_gate.mjs" {
	export function expectedReleaseHeading(packageJson: {
		version?: unknown;
	}): string;
	export function classifyReleaseNotes(subject: {
		packageJson: { version?: unknown };
		notes: string;
	}): { ok: boolean; reason?: string };
	export function main(): number;
}

declare module "*release_evidence.mjs" {
	export function buildReleaseEvidence(...args: any[]): any;
	export function validateReleaseEvidenceSet(...args: any[]): any;
	export function main(...args: any[]): any;
}

declare module "*release_tag_gate.mjs" {
	export function buildTagEvidence(...args: any[]): any;
	export function classifyTagRef(...args: any[]): any;
	export function parseRemoteTags(...args: any[]): any;
	export function parseRemoteTagRefs(...args: any[]): any;
	export function verifyCleanupTargets(...args: any[]): any;
	export function main(...args: any[]): any;
}

declare module "*known_gap_gate.mjs" {
	export const BANNED_PROSE_PHRASES: readonly string[];
	export type KnownGapProblem = {
		readonly file: string;
		readonly line: number;
		readonly phrase: string;
		readonly message: string;
	};
	export function collectTestSourceFiles(rootDir?: string): string[];
	export function scanBannedProse(
		source: string,
		filename: string,
	): readonly KnownGapProblem[];
	export function scanCollectedTestSources(
		rootDir?: string,
	): readonly KnownGapProblem[];
	export type KnownGapMarker = {
		readonly runner: "playwright" | "vitest";
		readonly type: "test.fail" | "test.fails" | "it.fails";
		readonly file: string;
		readonly title: string;
		readonly issue: number;
	};
	export type RunnerPolicyProblem = {
		readonly file: string;
		readonly line: number;
		readonly code: string;
		readonly message: string;
	};
	export function scanRunnerPolicy(
		source: string,
		filename: string,
	): {
		readonly markers: readonly KnownGapMarker[];
		readonly problems: readonly RunnerPolicyProblem[];
	};
	export type KnownGapRecord = {
		readonly id: string;
		readonly issue: number;
		readonly runner: "playwright" | "vitest";
		readonly type: "test.fail" | "test.fails" | "it.fails";
		readonly path: string;
		readonly title: string;
		readonly affectedScope: string;
		readonly releasePolicy: "block" | "allow";
		readonly impact?: string;
		readonly workaround?: string;
		readonly targetFixVersion?: string;
	};
	export type KnownGapsManifest = {
		readonly schemaVersion: 1;
		readonly targetVersion: string;
		readonly records: readonly KnownGapRecord[];
	};
	export type ManifestValidationProblem = {
		readonly code: string;
		readonly message: string;
	};
	export function validateKnownGapsManifest(
		manifest: unknown,
		inventory: readonly KnownGapMarker[],
		options: { readonly packageVersion: string; readonly release?: boolean },
	): {
		readonly records: readonly KnownGapRecord[];
		readonly problems: readonly ManifestValidationProblem[];
	};
	export function buildKnownLimitationsBlock(
		records: readonly KnownGapRecord[],
		version: string,
	): string;
	export function validateKnownLimitationsBlock(
		source: string,
		records: readonly KnownGapRecord[],
		version: string,
	): readonly ManifestValidationProblem[];
	export function getLiteralMarkerCounts(
		sources: readonly string[],
	): Record<string, number>;
	export function formatLiteralMarkerCounts(
		counts: Record<string, number>,
	): readonly string[];
	export function formatLocalDiagnostic(problem: KnownGapProblem): string;
	export function formatGitHubAnnotation(problem: KnownGapProblem): string;
	export function main(): number;
}
