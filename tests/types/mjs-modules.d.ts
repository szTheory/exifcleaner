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
