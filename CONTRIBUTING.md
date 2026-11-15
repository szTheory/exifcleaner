# Contributing to ExifCleaner

Thanks for helping. Small, focused pull requests are easiest to review and safest for a
desktop privacy tool.

## Start here

- Read the [engineering guide](docs/README.md) before changing a subsystem.
- Open or reference an issue for behavior changes; explain the user outcome, not a proposed
  refactor alone.
- Keep network access, telemetry, and background update checks out of the application.
- Do not weaken sender validation, sandboxing, output verification, directory-effect
  assertions, or packaged smoke tests.

## Local workflow

```bash
yarn install
yarn dev
yarn typecheck
yarn test
yarn test:e2e
```

Before opening a PR, run `yarn lint`, `yarn check:deps`, and the tests closest to your
change. Packaging/release changes also need the relevant packaged-smoke path described in
[Build, tests, and releases](docs/subsystems/build-test-release.md).

### Storybook (renderer catalog)

Storybook is a development tool only: it is never part of the app bundle and sends nothing
over the network (telemetry is off in config and in every script, and a preloaded network
guard blocks any non-local connection).

```bash
yarn storybook:dev    # local dev server on port 6006, no browser opened, telemetry off
yarn storybook:build  # static build into storybook-static/
yarn test:storybook   # Storybook's own vitest projects (separate from yarn test)
```

The repository `.npmrc` skips Playwright browser downloads, so run
`npx playwright install chromium` once before the browser-based Storybook tests
(Playwright 1.64.1 needs Chromium revision 1248).

### Adding or changing a story

Every story file sets an explicit `title` and `component` in `meta` and imports the
component unaliased. Its story ids go into a scenario in
`.storybook/catalog/scenarios.json` in the same PR.

```bash
yarn catalog:write   # regenerate the catalog files and prune stale copy findings
yarn catalog:check   # fails on drift or invalid data (CI also compares a built index)
```

`yarn catalog:check` compares the copy register with `origin/master`. Without that ref (a
fork clone) it stops with `base ref origin/master not found`: run `git fetch origin`, or
pass another ref with `node .storybook/catalog/catalog.mjs --check --base <ref>`.

`yarn catalog:write` regenerates these files in `.storybook/catalog/`. Do not edit them by
hand; edit the source named here and run it again.

- `GLOSSARY.md`: from `glossary.json`.
- `PERSONAS.md`: from `catalog.json`.
- `JOURNEYS.md`: from `journeys/*.json`.
- `FINDINGS.md`: from `docs/evidence/known-findings.json` and `copy-findings.json`.
- `coverage-grid.json` and `COVERAGE-GRID.md`: from `scenarios.json`, `subjects.json`,
  `waivers.json` and each story's `meta.component`.
- `UI-SPEC.md`: from `ui-spec.json`.
- `TOKEN-MAP.md`: from `token_map.json`.
- `TEST-SHIFT.md`: from `test-shift.json`.

When `yarn catalog:check` fails, the message names what to do:

- `story-unmapped`: a story is in no scenario. Add its id to the `stories` of a scenario in
  `scenarios.json` whose stories share its `meta.component` and whose tier is that
  component's tier in `subjects.json` (otherwise the check reports `mixed-subject` or
  `tier-subject-mismatch`). A new scenario names a persona, a job, a state class, a tier, a
  situation and a proof boundary. Adding the id to an existing scenario needs no further
  step; a new scenario changes the coverage grid, so then run `yarn catalog:write` and
  commit the regenerated files.
- `<file> is stale; run yarn catalog:write`: a generated file no longer matches its source.
  Run it and commit the result.
- `stale: entry ... run yarn catalog:write to remove it`: you fixed a copy deviation. One
  `yarn catalog:write` removes the entry from `copy-findings.json` and regenerates
  `FINDINGS.md`; commit both.
- `unlisted`: a user-facing string breaks the copy rules and has no register entry. The
  register only shrinks, so do not add one. On an `en:` ref, reword the string in
  `.resources/locales/en.json`. On a `src:` ref (a hardcoded string in a component under
  `src/renderer`), rewording only makes another literal: move the text into the locale
  resources and render it with the i18n lookup, `t("key")`.
- `added`: a register entry that was not in the merge-base's register is rejected. Remove
  the entry and reword the string instead.
- `refusing to write`: `yarn catalog:write` stops and changes nothing while an `unlisted`
  or malformed register problem exists. Fix that first, then run it again.

## Translation corrections

Translations live in `.resources/locales/<locale>.json`. English is the canonical key set.
A useful correction PR can change one string without touching unrelated translations.

1. Edit only your locale file. Use the existing English key and preserve placeholders such
   as `{count}` exactly.
2. Update the matching entry in `.resources/translation-provenance.json`: record the
	current English source hash, use `existing-contribution` as the origin, and label the
	review accurately. If the translation intentionally equals English, include a concise
	`sourceIdenticalReason`. A maintainer can help calculate the SHA-256 source hash.
3. Run `yarn i18n:write` to regenerate `.resources/strings.json`, the deterministic
   translation worklist, and the coverage report.
4. Run `yarn i18n:check` and test the locale with `yarn dev --lang=<locale>`.
5. In the PR, say whether you are a native speaker and briefly explain wording that is
   context-sensitive.

AI suggestions are welcome as review notes, but they must be labeled as AI-assisted,
independently reviewed, and must not replace an existing human translation without a
fluent reviewer.

Every supported locale must cover every canonical key with current provenance. Missing,
stale, placeholder-invalid, or unjustified source-identical text fails `yarn i18n:check`.
Adding or changing English UI copy therefore includes the corresponding reviewed locale
updates; unrelated contributions remain unaffected while resources are current.

## Pull-request shape

- One user outcome or maintenance concern per PR.
- Add a regression test that would have failed before the change.
- Update docs when an IPC contract, safety invariant, setting, processing outcome, or
  release gate changes.
- Avoid drive-by formatting, comment removal, dependency churn, or unrelated TODO cleanup.
