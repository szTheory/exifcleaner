// Closed vocabularies shared by the catalog tooling (Phase 71, D-02).
//
// Every export is frozen. Plans 02-05 import these and never redefine a closed
// set. This first slice holds what the glossary validator needs; the remaining
// vocabularies are added beside it.

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

// Glossary term id: a kebab slug.
export const TERM_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
