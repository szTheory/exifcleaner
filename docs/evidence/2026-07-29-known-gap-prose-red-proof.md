# Known-gap prose gate red proof

**Captured:** 2026-07-29T23:57:05Z

This record preserves the real pre-conversion repository failure for GATE-03. It was captured after
`scripts/known_gap_gate.mjs` and `yarn verify:known-gaps` existed, before rewriting the prose marker
in `tests/e2e/settings.spec.ts`.

## Environment

| Field | Value |
|---|---|
| Base SHA before prose conversion (`git rev-parse HEAD`) | `cd59a10b0ce4f8a5ef6a051dd2664f79d00ad13c` |
| Capture date | 2026-07-29 |
| Command | `yarn verify:known-gaps` |
| Exit code | 1 |

## Verbatim terminal output

```text
yarn run v1.22.22
$ node scripts/known_gap_gate.mjs

✗ KNOWN-GAP GATE FAILED:
tests/e2e/settings.spec.ts:209: known-gap prose phrase "deferred" is not machine-readable. Move this known gap into a declaration-time expected-failure marker.
tests/e2e/settings.spec.ts:209: known-gap prose phrase "doesn't currently" is not machine-readable. Move this known gap into a declaration-time expected-failure marker.
tests/e2e/settings.spec.ts:210: known-gap prose phrase "pre-existing gap" is not machine-readable. Move this known gap into a declaration-time expected-failure marker.

error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
```

## Interpretation

The new gate observed the intended pre-conversion failure in the live collected test source. This
historical record is intentionally separate from the permanent unit negative control, which constructs
a fresh violation against the finished gate.
