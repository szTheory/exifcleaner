# Issue #304 — save-as-copy red proof

**Captured:** 2026-07-29T18:21:19Z, before any `test.fail()` modifier was added to `tests/e2e/settings.spec.ts`.

This record is the permanent, one-time observation required by GATE-02 and ROADMAP criterion 2: the
`#304` directory-effect assertion genuinely failing against unfixed code, captured at the phase base SHA,
before Phase 21's fix exists. Per D-07 this cannot be regenerated after Phase 21 lands.

## Environment

| Field | Value |
|---|---|
| Base `master` SHA (`git rev-parse HEAD` immediately after the Phase 18 merge, recorded in `18-01-SUMMARY.md`) | `21221d260aa21177436cfabca22aab6e83aec3a4` |
| `git describe --tags --always` (at the base SHA) | `v4.0.0-8-g21221d2` |
| Base commit date (`git log -1 --format=%cI`) | `2026-07-29T13:15:06-04:00` |
| Capture date (this run) | 2026-07-29 (`2026-07-29T18:21:19Z`) |
| HEAD at capture time (uncommitted worktree, descendant of base SHA — plans 18-02/18-03 landed helper + retrofit prep, no `#304` fix exists anywhere in this history) | `f00968ebba69a960319a55931e90b6c658927510` (`git describe`: `v4.0.0-18-gf00968e`) |
| OS / arch (`uname -mrs`) | `Darwin 25.5.0 arm64` |
| `@playwright/test` version (pinned exact in `package.json`) | `1.62.0` |
| exiftool version (bundled binary, `.resources/nix/bin/exiftool -ver`) | `13.50` |
| `tests/e2e/fixtures/sample.jpg` SHA-256 (BEFORE, unmodified fixture — matches `18-01-SUMMARY.md` verbatim) | `b61e7f08e2904bcd932c7087836e0dcd28e280bde0a6ccb295b191c14e2ec49b` |

`.gitattributes`'s `* text=auto eol=lf` can silently renormalize and regenerate this fixture
(`tests/e2e/fixtures/generate_fixtures.ts`), which would invalidate every digest recorded below —
hence recording the full SHA-256, not a truncated form, and re-verifying it fresh at capture time
(matches the value `18-01-SUMMARY.md` recorded at the base SHA, confirming no drift).

## Exact command

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=docs/evidence/2026-07-29-issue-304-red-proof.json \
npx playwright test --project=dev --grep "#304" --reporter=list,json
```

Run once. List reporter went to the terminal (captured below); JSON reporter wrote
`docs/evidence/2026-07-29-issue-304-red-proof.json` verbatim (committed unedited — Playwright's own
schema, not hand-summarized, per D-08/D-09). Observed exit code: **1** (the run correctly reports
failure — this is the result being recorded, not a defect in this task).

## Verbatim terminal output (list reporter, ANSI color codes stripped for readability; no other edits)

```
Running 3 tests using 1 worker

  ✘  1 [dev] › tests/e2e/settings.spec.ts:217:2 › Settings › #304 save-as-copy on: original survives, a cleaned copy appears (1.4s)
  ✓  2 [dev] › tests/e2e/settings.spec.ts:259:2 › Settings › #304 characterization (DELETE WITH THE FIX): save-as-copy currently overwrites the original (1.4s)
  ✓  3 [dev] › tests/e2e/settings.spec.ts:298:2 › Settings › #304 overwrite mode (not a #304 proof, stays green after the fix): save-as-copy off overwrites in place (1.4s)


  1) [dev] › tests/e2e/settings.spec.ts:217:2 › Settings › #304 save-as-copy on: original survives, a cleaned copy appears 

    Error: assertDirEffect found 3 problem(s):
    unnamed file modified (content differs): sample.jpg
    declared added but did not happen: sample_cleaned.jpg
    declared unchanged but changed or missing: sample.jpg

    Full delta (= unchanged, ~ modified, + added, - removed):
    ~ sample.jpg  (711 -> 315)  content differs

    Paste-ready observed literal:
    added: []
    modified: ["sample.jpg"]
    removed: []

       at ../helpers/dir_effect.ts:372

      370 | 	}
      371 |
    > 372 | 	throw new Error(renderFailure(rows, problems));
          | 	      ^
      373 | }
      374 |
        at assertDirEffect (/Users/jon/projects/exifcleaner/exifcleaner-electron/tests/helpers/dir_effect.ts:372:8)
        at /Users/jon/projects/exifcleaner/exifcleaner-electron/tests/e2e/settings.spec.ts:241:4

    Error Context: test-results/settings-Settings-304-save-ea9bd-ives-a-cleaned-copy-appears-dev/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/settings-Settings-304-save-ea9bd-ives-a-cleaned-copy-appears-dev/trace.zip
    Usage:

        npx playwright show-trace test-results/settings-Settings-304-save-ea9bd-ives-a-cleaned-copy-appears-dev/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [dev] › tests/e2e/settings.spec.ts:217:2 › Settings › #304 save-as-copy on: original survives, a cleaned copy appears 
  2 passed (4.9s)
EXITCODE=1
```

This is exactly the run the orchestrator's independent pre-check produced (same three verdicts, same
byte counts, same error text) — no drift between the two runs, confirming the harness is deterministic
and not producing a retry artifact (`workers: 1`, `retries: 0` on the `dev` project).

## RED/GREEN verdict table (D-06, D-09)

| Direction | Test | Verdict | Why |
|---|---|---|---|
| save-as-copy **ON** | `#304 save-as-copy on: original survives, a cleaned copy appears` (`tests/e2e/settings.spec.ts:217`) | **RED** | `sample_cleaned.jpg` never appears; the original `sample.jpg` is modified in place (711 → 315 bytes) instead of surviving untouched. |
| save-as-copy **ON**, characterization | `#304 characterization (DELETE WITH THE FIX)` (`:259`) | GREEN (pins today's broken behavior on purpose) | Asserts exactly what happens today: `sample.jpg` modified, nothing added. Confirms test 1's RED is attributable to #304, not to a broken harness — this test would also fail if the harness itself broke. |
| overwrite mode (save-as-copy **OFF**) | `#304 overwrite mode (not a #304 proof, stays green after the fix)` (`:298`) | **GREEN** | `sample.jpg` modified in place, as intended for this mode. This is the correct, expected behavior for overwrite mode and must stay green after Phase 21. |

**E-09 predicted red in both directions. The measured result is one direction red, one direction
green — record that honestly rather than reword the assertion until it fails (ROADMAP criterion 3).**
The reason both directions produce bit-identical bytes is structural, not coincidental: **#304
collapses both settings onto the same code path.** `src/main/exif_handlers.ts` never passes an
`outputPath` to `StripMetadataCommand.execute`, so `strip_metadata_command.ts`'s
`if (saveAsCopy && outputPath)` guard is never true regardless of the `saveAsCopy` setting's value —
every call falls through to the `-overwrite_original` branch. One hash pair (below) proves the whole
bug: save-as-copy ON produces the exact same output bytes as save-as-copy OFF, because the code never
actually branches on it. No fourth test was added to manufacture a second red direction — there is
structurally only one.

## Original file hash pair (before/after, D-08/D-09)

Independently reproduced outside the Playwright run, by copying the fixture into a scratch directory
and invoking the bundled exiftool binary with the exact argv `strip_metadata_command.ts` builds for
today's settings defaults (`preserveOrientation: true`, `preserveColorProfile: true`,
`preserveTimestamps: false`, `saveAsCopy` irrelevant since `outputPath` is never supplied):

```
.resources/nix/bin/exiftool -all= -TagsFromFile @ -Orientation -ICC_Profile -overwrite_original sample.jpg
```

| | SHA-256 | Size |
|---|---|---|
| Before | `b61e7f08e2904bcd932c7087836e0dcd28e280bde0a6ccb295b191c14e2ec49b` | 711 bytes |
| After | `9be4d89d940423ad023c1bc5bd86e52abb124eef5ffcc1780d19baf960ea1e33` | 315 bytes |

This matches the byte-count delta observed inside the Playwright run itself (`711 -> 315`) and confirms
save-as-copy ON and OFF produce bit-identical output — the single hash pair covers both directions.

## Traced root cause

Three source sites, named per D-08:

1. **`src/main/exif_handlers.ts:24-33`** — the `exif:remove` IPC handler builds the
   `StripMetadataCommand.execute()` call with `preserveOrientation`, `preserveColorProfile`,
   `preserveTimestamps`, and `saveAsCopy` read from settings, but **never passes `outputPath`**. This is
   the root cause: the command receives `saveAsCopy: true` but has no destination to write a copy to.
2. **`src/application/commands/strip_metadata_command.ts:52`** — `if (saveAsCopy && outputPath)` is
   #304's exact shape. Because `outputPath` is always `undefined` from the call site above, this
   condition is always false, and the command always falls through to the `else` branch
   (`-overwrite_original`, line 55) regardless of what the user selected.
3. **`src/renderer/components/file-list/FileRow.tsx:16,87,98`** — `computeCleanedPath()` locally
   computes a `_cleaned` filename and the "reveal in file manager" action targets it when
   `saveAsCopy` is true, but that file is never created by the pipeline above. This is the adjacency
   defect: the UI already believes a cleaned copy exists and offers to reveal it, while the original was
   silently destroyed instead.

`src/domain/files/cleaned_path.ts`'s `generateCleanedPath` (collision-safe, unit-tested) has zero
production consumers today — Phase 21 is mostly wiring this in and threading `outputPath` through the
two sites above.

## Reproduction recipe

After Phase 21 fixes #304, this exact RED result can be reproduced (to confirm the fix is real) by
reverting this evidence commit and re-running the grep:

```bash
git revert <this-commit-sha> --no-commit
yarn test:e2e --grep "#304"
# Expect: test 1 fails again with the same assertDirEffect delta recorded above.
git reset --hard HEAD   # discard the revert once confirmed — do not commit it
```

## Instruction for Phase 21

Phase 21 must, as part of landing the #304 fix:

1. **Delete test 2** (`#304 characterization (DELETE WITH THE FIX)`, `tests/e2e/settings.spec.ts:259`)
   entirely — its whole purpose is to characterize today's broken behavior and it has no reason to exist
   once that behavior is fixed.
2. **Remove the `test.fail(` declaration-time modifier from test 1** (`#304 save-as-copy on: original
   survives, a cleaned copy appears`) so it becomes a normal `test(...)` — a passing #304 proof.
3. Confirm `grep -c 'test.fail(' tests/e2e/settings.spec.ts` returns `0` and
   `yarn test:e2e --grep "#304"` exits `0` with **all three** tests passing (test 2 having been deleted,
   test 3 unaffected).

## Note on the pre-existing prose gap marker

`tests/e2e/settings.spec.ts:208-211` carries a four-line prose comment describing this same gap that
predates this plan and is intentionally left untouched here (D-29) — Phase 19 converts it. This document
does not reproduce that comment's text; see the file and line above (D-30).
