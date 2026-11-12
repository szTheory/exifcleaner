// Closed vocabularies shared by the catalog tooling (Phase 71, D-02).
//
// Every export is frozen. Plans 02-05 import these and never redefine a closed
// set.

// The criterion's twelve state classes, in its order (D-19). A test pins this
// list against a hard-coded copy.
export const STATE_CLASSES = Object.freeze([
	"happy",
	"empty",
	"one",
	"many",
	"boundary",
	"loading",
	"error",
	"denied",
	"stale",
	"long",
	"intl",
	"huge",
]);

// A scenario has exactly one primary class; when two seem to apply the first
// match in this order wins (D-19).
export const STATE_CLASS_TIEBREAK = Object.freeze([
	"denied",
	"stale",
	"error",
	"loading",
	"empty",
	"huge",
	"boundary",
	"long",
	"intl",
	"many",
	"one",
	"happy",
]);

const def = (definition, classifyLike, anchors) =>
	Object.freeze({
		definition,
		classifyLike,
		anchors: Object.freeze([...anchors]),
	});

// One definition per class. Anchors are `path#symbol` strings, each a file
// under FILTERED_TREES (or src/main/reveal_handlers.ts) that contains the
// symbol; a test resolves every one. `denied` and `stale` follow RESEARCH C7:
// `refused` is the denied outcome (a retry cannot succeed); the `commit` identity
// change and the reveal of a vanished file are stale, because the on-screen row
// outlived its source.
export const STATE_CLASS_DEFS = Object.freeze({
	happy: def(
		"A designed success path that ends in a verdict: cleaned, unchanged, already clean, the copy-mode disclosure rows, the settled empty screen, the default settings drawer.",
		"Pick happy when the state is the intended outcome and nothing is missing or failing. A zero count is not boundary here.",
		[
			"src/domain/files/file_processing_outcome.ts#FileProcessingOutcomeKind",
			"src/renderer/components/ui/EmptyState.tsx#EmptyState",
		],
	),
	empty: def(
		"Zero items where items are expected: the empty screen, a folder with no supported files, a table with no rows, a group with no fields.",
		"Pick empty when the point of the state is that nothing is there yet.",
		[
			"src/renderer/components/ui/EmptyState.tsx#EmptyState",
			"src/renderer/components/file-list/FolderRow.tsx#FolderRow",
			"src/renderer/components/file-list/FileTable.tsx#FileTable",
		],
	),
	one: def(
		"Exactly one item, where the singular plural form is what is tested: one row, one field removed.",
		"Pick one when the singular wording or layout is the reason for the scenario.",
		[".resources/locales/en.json#metadata.removed.one"],
	),
	many: def(
		"Several items with mixed outcomes, the plural form, fitting without scrolling: a mid-batch table.",
		"Pick many when the plural form or the mix of outcomes is the reason for the scenario.",
		[
			".resources/locales/en.json#metadata.removed.other",
			"src/renderer/components/file-list/FileTable.tsx#FileTable",
		],
	),
	boundary: def(
		"A value at the edge of a defined limit, or zero input: a zero-byte file, the 80-character metadata cut, a size cap, an A to B size.",
		"Pick boundary when the scenario sits on a limit the code defines.",
		[
			"src/renderer/components/file-list/MetadataField.tsx#valueStr",
			"src/renderer/utils/format_file_size.ts#formatFileSize",
		],
	),
	loading: def(
		"In flight with no verdict yet: pending, reading, processing, a folder still scanning, a provider that is not ready.",
		"Pick loading when the answer to what happened is not available yet.",
		[
			"src/domain/files/file_status.ts#FileProcessingStatus",
			"src/renderer/components/file-list/FolderRow.tsx#scanning",
			"src/renderer/contexts/ThemeContext.tsx#isLoading",
		],
	),
	error: def(
		"Attempted and failed, or corrupt input: a write, verification, cleanup or macOS attribute failure, and a read failure, with and without a leftover path.",
		"Pick error when the app tried and a retry inside the app could succeed.",
		[
			"src/common/ipc_channels.ts#failureKind",
			"src/renderer/components/file-list/FileRow.tsx#failureKind",
			"src/renderer/components/file-list/ErrorExpansion.tsx#ErrorExpansion",
		],
	),
	denied: def(
		"Policy blocks the action and retrying inside the app will not help: the refused outcome (an unsafe RAF write). An unreadable folder is an unrendered state, so a finding.",
		"Pick denied when the rule is deterministic: can an in-app retry succeed? No.",
		[
			"src/domain/files/file_processing_outcome.ts#unsafe-raf-write",
			".resources/locales/en.json#intake.foldersUnreadable",
		],
	),
	stale: def(
		"On-screen information outlives its source: the commit identity change (another app changed the file) and the reveal of a vanished file. The renderer has no revalidation, so expect waivers or findings.",
		"Pick stale when the source changed after the row was shown.",
		[
			"src/renderer/components/file-list/FileRow.tsx#commitFailedSummary",
			"src/main/reveal_handlers.ts#File no longer exists",
		],
	),
	long: def(
		"Text longer than its container, ellipsis or wrap: long file names, long German or Hungarian labels, long error detail.",
		"Pick long when length, not language, is what stresses the layout.",
		[
			"src/renderer/components/file-list/FileRow.tsx#bdi",
			"src/domain/path_truncation.ts#middleTruncatePath",
		],
	),
	intl: def(
		"Script, direction, plural or locale differences regardless of length: right-to-left locales, bidirectional file names, CJK.",
		"Pick intl when language or direction, not length, is the reason for the scenario.",
		["src/renderer/contexts/I18nContext.tsx#isRightToLeft"],
	),
	huge: def(
		"Magnitude that stresses layout or performance: thousands of files, gigabyte sizes, the large-batch screen.",
		"Pick huge when the quantity itself is the stress.",
		[
			"src/renderer/components/file-list/FileTable.tsx#FileTable",
			"src/renderer/components/ui/StatusBar.tsx#StatusBar",
		],
	),
});

// Subject tiers (D-20) and the phase that owes each one (D-26).
export const TIERS = Object.freeze(["primitive", "pattern", "area", "screen"]);
export const TIER_DUE = Object.freeze({
	primitive: "72",
	pattern: "72",
	area: "73",
	screen: "73",
});

// Where a scenario's proof stops.
export const PROOF_BOUNDARIES = Object.freeze([
	"story",
	"story+unit",
	"story+e2e",
]);

// Glossary term status. `reserved` (amendment A-3) is a brand term no string
// uses yet: it needs no surface, and the validator rejects it once a string
// adopts it.
export const GLOSSARY_STATUSES = Object.freeze([
	"canonical",
	"proposed",
	"technical",
	"os-owned",
	"deprecated",
	"reserved",
]);

// Closed prefixes of a glossary `surfaces` entry.
export const SURFACE_PREFIXES = Object.freeze(["en:", "src:", "os:"]);

// Classes of a content-word waiver (D-07).
export const WORD_WAIVER_CLASSES = Object.freeze([
	"generic-verb",
	"generic-adjective",
	"os-term",
	"proper-noun",
]);

// Copy-findings register (D-13).
export const FINDING_KINDS = Object.freeze([
	"vocab",
	"banned",
	"name",
	"hardcoded",
	"main",
	"manual",
]);
export const FINDING_SURFACES = Object.freeze(["en", "renderer", "main"]);
export const DISPOSITIONS = Object.freeze([
	"fix-v5.1",
	"fix-v5.2",
	"accept",
	"reject",
]);

// Persona and job catalog (D-15 to D-18).
export const PERSONA_IDS = Object.freeze([
	"P-batch",
	"P-photographer",
	"P-sharer",
	"P-source",
]);
export const CLAIM_TAGS = Object.freeze(["confirmed", "assumed", "proposal"]);
export const CLAIM_ABOUT = Object.freeze(["user", "product"]);
export const SOURCE_KINDS = Object.freeze([
	"issue",
	"code",
	"string",
	"brand",
	"maintainer",
	"none",
]);
export const VALIDATE_BY = Object.freeze([
	"issue-watch",
	"feedback-thread",
	"volunteer-session",
	"code-trace",
]);
export const RED_FLAG_KINDS = Object.freeze(["never-happen", "never-say"]);

// Coverage-grid waiver bases (D-25).
export const WAIVER_BASES = Object.freeze(["unreachable", "duplicate", "e2e"]);

// Id patterns.
export const TERM_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const JOB_ID_PATTERN = /^J-\d{2}$/;
export const RED_FLAG_ID_PATTERN =
	/^RF-(sharer|source|photographer|batch)-\d+$/;
export const SCENARIO_ID_PATTERN =
	/^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/;

// The trees the Storybook workflow path filter covers (RESEARCH C13). A
// glossary `internal` identifier and a `src:` surface must live here, so the
// check cannot go stale outside the filter (amendment A-2).
export const FILTERED_TREES = Object.freeze([
	"src/renderer",
	"src/domain",
	"src/common",
	"src/preload/api_types.ts",
	".resources/locales",
]);
