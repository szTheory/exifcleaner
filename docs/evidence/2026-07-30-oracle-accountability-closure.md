# Oracle Accountability Closure

Date: 2026-07-31
Purpose: close Phase 20 against the amended measured-evidence boundary without changing application behavior or inventing issue artifacts.

## Environment

| Field | Value |
|---|---|
| HEAD | `aa4288f` |
| `git describe --tags --always` | `v4.0.0-76-gaa4288f` |
| Node | `v22.14.0` |
| Yarn | `1.22.22` |
| Electron package range | `^35` |
| Bundled ExifTool | `13.50` |

## Completed Plan Identities

| Plan | Summary identity |
|---|---|
| 20-01 | RED `1ba3fcd`; GREEN `9fd326c` |
| 20-02 | Task commits `c6d3505`, `395dd78` |
| 20-03 | Task commits `c532ca5`, `a576bf0` |
| 20-04 | Task commits `c4068fc`, `aa4288f` |

## Current Command Verdicts

All commands below were run from `exifcleaner-electron` on 2026-07-31.

| Command | Verdict | Observed result |
|---|---|---|
| `yarn typecheck` | pass | `tsc --noEmit` exited 0 |
| `yarn test tests/e2e/fixtures/fixture_integrity.test.ts` | pass | 14 fixture-integrity tests passed |
| `yarn compile` | pass | main, preload, and renderer builds completed |
| `yarn test:e2e tests/e2e/oracle-accountability.spec.ts --grep "shared oracle\|#240"` | pass | 3 tests passed; the direct `#240` marker is the one expected failure |
| `yarn test:e2e tests/e2e/settings.spec.ts --grep "preserves orientation metadata when toggle is enabled"` | pass | 1 exact-orientation application-flow test passed |
| `yarn verify:known-gaps` | pass | 2 expected-failure markers inventoried |
| `yarn known-gaps:check` | pass | release-note known limitations block is current |
| Source/manifest policy assertion from `20-05-PLAN.md` | pass | no forbidden oracle exceptions; exactly one `#240` marker; allow set is `[240]`; no `#217` or `#255` manifest record |
| `test ! -e docs/evidence/2026-07-30-oracle-fixture-discovery.json` | pass | false four-entry reproduced manifest remains absent |
| `git diff --exit-code -- src/application/commands/strip_metadata_command.ts` | pass | no controlled orientation mutation remains in production source |

## Issue Disposition Matrix

| Issue | Current disposition | Executable marker | Manifest allow record | Evidence boundary |
|---|---|---|---|---|
| `#240` MP4 create-date family | reproduced | exactly one direct `test.fail()` in `tests/e2e/oracle-accountability.spec.ts` | exactly one `releasePolicy: "allow"` record, `KG-240-mp4-create-dates` | real app flow retains `CreateDate`, `TrackCreateDate`, and `MediaCreateDate` |
| `#217` MP4 `Source` | not reproduced | none | none | synthetic candidate stripped cleanly through the real app flow |
| `#255` resolution values | not reproduced | none | none | synthetic candidate stripped cleanly through the real app flow |

This matrix does not claim `#217` or `#255` are fixed or nonexistent. It only records that Phase 20 did not measure a real-app residual that qualifies for executable known-gap identity.

## Shared Oracle Boundary

`tests/e2e/helpers/metadata_assertions.ts` remains the shared E2E and smoke stripping oracle.

- `SourceFile` is handled as an exact computed tag name.
- The six issue-owned names are not structural exceptions: `Source`, `XResolution`, `YResolution`, `CreateDate`, `MediaCreateDate`, `TrackCreateDate`.
- The focused source assertion confirmed no direct quoted exception for those six names and confirmed the exact `SourceFile` exception.

## GATE-06 Two-Sided Contract

The current focused Playwright run covered both shared-oracle directions:

- Rejects unstripped `sample.jpg` and names residual metadata, including the resolution tags that are no longer hidden.
- Accepts a stripped structural-only `no_metadata.jpg` copy.

Primary evidence:

- `tests/e2e/oracle-accountability.spec.ts`
- `20-01-SUMMARY.md`

## GATE-07 Exact Orientation Contract

The current focused Playwright run verified `Orientation = Rotate 90 CW` survives the real application flow when preservation is enabled.

Primary evidence:

- `tests/e2e/settings.spec.ts`
- `docs/evidence/2026-07-30-orientation-red-proof.md`

The RED/GREEN evidence proves the check fails when only `-Orientation` copy-back is removed, and the current production-source diff check proves that controlled mutation is not present.

## Existing Evidence Links

- `docs/evidence/2026-07-30-oracle-fixture-discovery.md` records the measured reproduced/non-reproduced boundary for `#217`, `#240`, `#255`, and orientation.
- `docs/evidence/2026-07-30-oracle-known-gaps-red-proof.md` records the unannotated `#240` residual failure before the direct expected-failure marker was added.
- `docs/evidence/2026-07-30-orientation-red-proof.md` records the controlled mutation RED, source restoration proof, and final GREEN.

## Flagged Assumptions Preserved

| Requirement | Category | Status | Reason |
|---|---|---|---|
| GATE-05 | idempotency | unresolved | Phase 20 measured the single real-app flow and does not infer repeated-cleaning semantics for residual classification. |
| GATE-05 | concurrency | unresolved | Phase 20 preserves the one-issue/one-measured-flow contract without inventing concurrent-processing semantics for marker ownership. |
| GATE-06 | unclassified | unresolved | The two-sided real-fixture oracle contract is complete, but no broader edge semantics are inferred. |
| GATE-07 | unclassified | unresolved | The exact-value application test and deliberate mutation proof close the requirement without inventing a broader edge classification. |

## Phase 25 Handoff Boundary

Phase 25 may review or correct public claims using measured behavior and traced call sites. It may cite that Phase 20's synthetic `#217` and `#255` candidates stripped cleanly through the current real app flow.

Phase 25 must not claim `#217` or `#255` are fixed, nonexistent, or root-caused by Phase 20 evidence. Future executable coverage for either issue requires both:

1. a measured synthetic recipe that reproduces the named residual, and
2. an exact real-app before/after transcript proving the residual survives ExifCleaner processing.

Phase 20 performed no issue-triage automation, no external tracker action, and no SIZE semantics work.

## Closure Verdict

Phase 20 is sealed against the amended measured-evidence contract:

- `#240` is the only measured executable metadata allow exception.
- `#217` and `#255` remain evidence-first investigations with no fabricated marker, fixture manifest, or allow record.
- The strict shared oracle, two-sided GATE-06 proof, and exact GATE-07 RED/GREEN evidence remain linked and current.
- No application source, fixture, schema, UI, dependency, network behavior, release-note hand edit, or external issue state changed for this closure task.
